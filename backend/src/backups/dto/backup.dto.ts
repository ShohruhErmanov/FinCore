import { ApiProperty } from '@nestjs/swagger';

export class BackupItemDto {
  @ApiProperty({ example: 'fincore-2026-10-22-12-49-38.dump', description: 'Zaxira fayli nomi' })
  filename!: string;

  @ApiProperty({ example: 290751, description: 'Fayl hajmi (baytlarda)' })
  sizeBytes!: number;

  @ApiProperty({ example: '283.9 KB', description: 'Fayl hajmi (odam o‘qiy oladigan formatda)' })
  sizeFormatted!: string;

  @ApiProperty({ example: '2026-10-22T12:49:38.000Z', description: 'Yaratilgan sana va vaqt (ISO)' })
  createdAt!: string;
}

export class BackupCreateResponseDto extends BackupItemDto {
  @ApiProperty({ example: 'fincore', description: 'Zaxira qilingan PostgreSQL sxemasi' })
  schema!: string;

  @ApiProperty({ example: 'custom', description: 'pg_dump arxivi formati (custom .dump)' })
  format!: string;

  @ApiProperty({ example: 1250, description: 'Zaxira olish davomiyligi (millisekundlarda)' })
  durationMs!: number;
}
