import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiException, type AuthenticatedUser } from '@/common';
import { APP_ENV, type AppEnv } from '@/config';
import { ActorContextService, PrismaService, redactConnectionString } from '@/database';
import type { BackupCreateResponseDto, BackupItemDto } from './dto/backup.dto';

export const SAFE_BACKUP_FILENAME_REGEX = /^fincore-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.dump$/;

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function resolvePgDumpPath(): string {
  if (process.env.PG_DUMP_PATH && existsSync(process.env.PG_DUMP_PATH)) {
    return process.env.PG_DUMP_PATH;
  }

  if (process.platform === 'win32') {
    const candidatePaths = [
      'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
    ];
    for (const p of candidatePaths) {
      if (existsSync(p)) return p;
    }
  }

  return 'pg_dump';
}

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private isBackingUp = false;
  readonly backupDir: string;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
    private readonly actor: ActorContextService,
  ) {
    const configuredDir = process.env.FINCORE_BACKUP_DIR;
    if (configuredDir) {
      this.backupDir = resolve(configuredDir);
    } else {
      const cwd = process.cwd();
      const parentDocker = resolve(cwd, '..', 'docker', 'backups');
      const localDocker = resolve(cwd, 'docker', 'backups');
      if (existsSync(resolve(cwd, 'docker'))) {
        this.backupDir = localDocker;
      } else if (existsSync(resolve(cwd, '..', 'docker'))) {
        this.backupDir = parentDocker;
      } else {
        this.backupDir = resolve(cwd, 'backups');
      }
    }
    mkdirSync(this.backupDir, { recursive: true });
  }

  /**
   * Zaxira amallarini faqat Direktor amalga oshira oladi.
   * Xavfsizlik bo'yicha boshqa har qanday rol rad etiladi.
   */
  assertDirector(user: AuthenticatedUser): void {
    const isDirector = user.roles.some((r) => r.role === 'director');
    if (!isDirector) {
      throw ApiException.forbidden('Zaxira nusxalarini boshqarish faqat Direktor uchun ruxsat etilgan.');
    }
  }

  /**
   * Bazaning .dump formatidagi to'liq xavfsiz zaxirasini yaratadi.
   */
  async createBackup(user: AuthenticatedUser): Promise<BackupCreateResponseDto> {
    this.assertDirector(user);

    if (this.isBackingUp) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'BACKUP_IN_PROGRESS',
        'Boshqa zaxira nusxasi yaratilmoqda. Iltimos, jarayon tugashini kuting.',
      );
    }

    if (!this.env.DATABASE_URL) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'DATABASE_UNCONFIGURED',
        'Ma’lumotlar bazasi ulanishi sozlanmagan.',
      );
    }

    this.isBackingUp = true;
    const startTime = Date.now();
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const filename = `fincore-${stamp}.dump`;
    const outPath = resolve(this.backupDir, filename);

    try {
      const url = new URL(this.env.DATABASE_URL);
      const pgDumpPath = resolvePgDumpPath();
      const dbName = url.pathname.replace(/^\//, '') || 'fincore';
      const host = url.hostname || 'localhost';
      const port = url.port || '5432';
      const dbUser = decodeURIComponent(url.username || 'postgres');
      const password = url.password ? decodeURIComponent(url.password) : '';

      const args = [
        '-h', host,
        '-p', port,
        '-U', dbUser,
        '-d', dbName,
        '--format=custom',
        '--schema=fincore',
        '--file=' + outPath,
      ];

      await new Promise<void>((resolvePromise, rejectPromise) => {
        let stderr = '';
        const child = spawn(pgDumpPath, args, {
          env: {
            ...process.env,
            ...(password ? { PGPASSWORD: password } : {}),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        child.on('error', (err) => {
          rejectPromise(err);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolvePromise();
          } else {
            const redacted = redactConnectionString(stderr.trim() || `Exit code ${code}`);
            rejectPromise(new Error(`pg_dump xatolik bilan yakunlandi: ${redacted}`));
          }
        });
      });

      const stats = statSync(outPath);
      const durationMs = Date.now() - startTime;
      const sizeBytes = stats.size;
      const sizeFormatted = formatBytes(sizeBytes);
      const createdAt = stats.birthtime.toISOString();

      await this.recordAudit(user, 'system.backup.create', filename, {
        filename,
        sizeBytes,
        durationMs,
        schema: 'fincore',
        format: 'custom',
      });

      this.logger.log(`Zaxira nusxasi yaratildi: ${filename} (${sizeFormatted}, ${durationMs}ms)`);

      return {
        filename,
        sizeBytes,
        sizeFormatted,
        createdAt,
        schema: 'fincore',
        format: 'custom',
        durationMs,
      };
    } catch (error) {
      if (existsSync(outPath)) {
        try {
          unlinkSync(outPath);
        } catch {
          // e'tiborga olinmaydi
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Zaxira yaratishda xato: ${message}`);
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'BACKUP_FAILED',
        `Zaxira nusxasini yaratishda xatolik yuz berdi: ${message.split('\n')[0]}`,
      );
    } finally {
      this.isBackingUp = false;
    }
  }

  /**
   * Mavjud zaxira nusxalari ro'yxatini qaytaradi (eng yangilari birinchi).
   */
  async listBackups(user: AuthenticatedUser): Promise<BackupItemDto[]> {
    this.assertDirector(user);

    if (!existsSync(this.backupDir)) {
      return [];
    }

    const files = readdirSync(this.backupDir);
    const validDumps = files.filter((f) => SAFE_BACKUP_FILENAME_REGEX.test(f));

    const items: BackupItemDto[] = [];
    for (const filename of validDumps) {
      try {
        const filePath = resolve(this.backupDir, filename);
        const stats = statSync(filePath);
        items.push({
          filename,
          sizeBytes: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.mtime.toISOString(),
        });
      } catch {
        // Fayl o'qishda xato bo'lsa ro'yxatni buzmaslik
      }
    }

    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Yuklab olish uchun fayl ma'lumotlarini tekshirib qaytaradi (Path Traversal xavfsizligi).
   */
  async getBackupFile(
    user: AuthenticatedUser,
    filename: string,
  ): Promise<{ filename: string; filePath: string; sizeBytes: number }> {
    this.assertDirector(user);

    if (!SAFE_BACKUP_FILENAME_REGEX.test(filename)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'INVALID_FILENAME', 'Yaroqsiz fayl nomi formati.');
    }

    const filePath = resolve(this.backupDir, filename);
    if (!filePath.startsWith(this.backupDir)) {
      throw ApiException.forbidden('Ruxsat etilmagan fayl yo‘li.');
    }

    if (!existsSync(filePath)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'BACKUP_NOT_FOUND', 'Zaxira fayli topilmadi.');
    }

    const stats = statSync(filePath);

    await this.recordAudit(user, 'system.backup.download', filename, {
      filename,
      sizeBytes: stats.size,
    });

    return {
      filename,
      filePath,
      sizeBytes: stats.size,
    };
  }

  /**
   * Eskirgan zaxira faylini xavfsiz o'chirish.
   */
  async deleteBackup(user: AuthenticatedUser, filename: string): Promise<{ success: boolean; message: string }> {
    this.assertDirector(user);

    if (!SAFE_BACKUP_FILENAME_REGEX.test(filename)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'INVALID_FILENAME', 'Yaroqsiz fayl nomi formati.');
    }

    const filePath = resolve(this.backupDir, filename);
    if (!filePath.startsWith(this.backupDir)) {
      throw ApiException.forbidden('Ruxsat etilmagan fayl yo‘li.');
    }

    if (!existsSync(filePath)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'BACKUP_NOT_FOUND', 'Zaxira fayli topilmadi.');
    }

    unlinkSync(filePath);

    await this.recordAudit(user, 'system.backup.delete', filename, { filename });
    this.logger.log(`Zaxira nusxasi o‘chirildi: ${filename}`);

    return { success: true, message: 'Zaxira nusxasi muvaffaqiyatli o‘chirildi.' };
  }

  private async recordAudit(
    user: AuthenticatedUser,
    action: string,
    entityId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.withActor(this.actor.mint(user.id), async (tx) => {
        await tx.$executeRaw`
          INSERT INTO fincore.audit_logs (
            actor_user_id, action, entity_type, entity_id, result, before_payload, after_payload
          ) VALUES (
            fincore.fn_current_actor_id(),
            ${action},
            'system_backup',
            ${entityId},
            'success',
            NULL,
            ${JSON.stringify(payload)}::jsonb
          )
        `;
      });
    } catch (err) {
      this.logger.warn(`Audit yozishda xatolik (${action}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
