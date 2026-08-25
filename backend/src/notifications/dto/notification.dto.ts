import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TelegramRecipientDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({
    readOnly: true,
    description: 'Xodim o‘z Telegramini tasdiqlaganmi. Server hisoblaydi — so‘rovdan qabul qilinmaydi.',
  })
  @IsOptional()
  @IsBoolean()
  linked?: boolean;
}

export class TelegramSettingsInputDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  dailyReminderEnabled!: boolean;

  @ApiProperty({ example: '18:30', description: 'Toshkent vaqti, HH:mm' })
  @Matches(/^\d{2}:\d{2}$/, { message: 'Eslatma vaqti HH:mm formatida bo‘lsin.' })
  reminderTimeLocal!: string;

  @ApiProperty()
  @IsBoolean()
  monthlyReportEnabled!: boolean;

  @ApiProperty({ minimum: 1, maximum: 28 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Hisobot kuni 1 va 28 orasida bo‘lsin.' })
  @Max(28, { message: 'Hisobot kuni 1 va 28 orasida bo‘lsin.' })
  monthlyReportDay!: number;

  @ApiProperty({ type: [TelegramRecipientDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelegramRecipientDto)
  recipients!: TelegramRecipientDto[];
}

export class MonthlyPreviewQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Hisob davri ID' })
  @IsUUID()
  period!: string;
}

/**
 * Deliberately empty: the test message always goes to the caller's OWN verified
 * chat. Accepting a destination here would turn the form into an authorisation
 * mechanism for pushing FinCore messages anywhere.
 */
export class TelegramTestDto {}

export class ReminderBranchResponseDto {
  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ nullable: true, example: null, description: 'null = shu kuni DailyRevenue yo‘q' })
  totalUzs!: string | null;

  @ApiProperty({ type: [TelegramRecipientDto] })
  recipients!: TelegramRecipientDto[];

  @ApiProperty({ nullable: true })
  message!: string | null;
}

export class ReminderPreviewResponseDto {
  @ApiProperty({ format: 'date', example: '2026-08-20' })
  businessDate!: string;

  @ApiProperty({ type: [ReminderBranchResponseDto] })
  branches!: ReminderBranchResponseDto[];
}
