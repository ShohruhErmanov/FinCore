import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import { BackupsService } from './backups.service';
import { BackupCreateResponseDto, BackupItemDto } from './dto/backup.dto';

@ApiTags('admin-backups')
@ApiCookieAuth('cookie')
@Controller('admin/backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Post('create')
  @RequirePermissions('user.manage')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Bazaning to‘liq xavfsiz .dump nusxasini yaratish (Faqat Direktor)' })
  @ApiResponse({ status: 201, type: BackupCreateResponseDto, description: 'Yangi yaratilgan zaxira nusxasi ma’lumotlari' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — Faqat Direktor huquqiga ega' })
  @ApiResponse({ status: 409, description: 'BACKUP_IN_PROGRESS — Zaxira nusxasi allaqachon yaratilmoqda' })
  @ApiResponse({ status: 500, description: 'BACKUP_FAILED — pg_dump bajarishda xatolik' })
  createBackup(@CurrentUser() user: AuthenticatedUser): Promise<BackupCreateResponseDto> {
    return this.backupsService.createBackup(user);
  }

  @Get()
  @RequirePermissions('user.manage')
  @ApiOperation({ summary: 'Mavjud zaxira nusxalarini ko‘rish (Faqat Direktor)' })
  @ApiOkResponse({ type: [BackupItemDto], description: 'Mavjud zaxira fayllari ro‘yxati' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — Faqat Direktor huquqiga ega' })
  listBackups(@CurrentUser() user: AuthenticatedUser): Promise<BackupItemDto[]> {
    return this.backupsService.listBackups(user);
  }

  @Get(':filename')
  @RequirePermissions('user.manage')
  @ApiOperation({ summary: 'Zaxira nusxa faylini yuklab olish (Faqat Direktor)' })
  @ApiParam({ name: 'filename', example: 'fincore-2026-10-22-12-49-38.dump', description: 'Zaxira fayli nomi' })
  @ApiResponse({ status: 200, description: 'Zaxira .dump fayli oqimi (binary octet-stream)' })
  @ApiResponse({ status: 400, description: 'INVALID_FILENAME — Yaroqsiz fayl nomi' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — Ruxsat etilmagan fayl yo‘li yoki rol' })
  @ApiResponse({ status: 404, description: 'BACKUP_NOT_FOUND — Zaxira fayli topilmadi' })
  async downloadBackup(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.backupsService.getBackupFile(user, filename);
    response.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': file.sizeBytes.toString(),
    });
    return new StreamableFile(createReadStream(file.filePath));
  }

  @Delete(':filename')
  @RequirePermissions('user.manage')
  @ApiOperation({ summary: 'Eski zaxira nusxasini xavfsiz o‘chirish (Faqat Direktor)' })
  @ApiParam({ name: 'filename', example: 'fincore-2026-10-22-12-49-38.dump' })
  @ApiResponse({ status: 200, description: 'Muvaffaqiyatli o‘chirildi' })
  @ApiResponse({ status: 400, description: 'INVALID_FILENAME' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'BACKUP_NOT_FOUND' })
  deleteBackup(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    return this.backupsService.deleteBackup(user, filename);
  }
}
