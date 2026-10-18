import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ISO_DATE_PATTERN, WHOLE_UZS_PATTERN } from '@/common/validation/patterns';

export class PayoutYearQueryDto {
  @ApiPropertyOptional({ example: 2026, minimum: 2000, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

/**
 * Notice what this does NOT carry: an investor id. The profile is resolved from
 * the session, so a client can never raise a request in someone else's name.
 */
export class PayoutRequestCreateDto {
  @ApiProperty({ format: 'uuid', description: 'Ulush hisoblanadigan hisob davri' })
  @IsUUID()
  periodId!: string;

  @ApiProperty({
    example: '6056829',
    description: 'So‘ralayotgan summa — butun so‘m, davr bo‘yicha qolgan summadan oshmasligi kerak',
  })
  @Matches(WHOLE_UZS_PATTERN, {
    message: 'amountUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak',
  })
  amountUzs!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PayoutDecisionDto {
  @ApiProperty({ enum: ['approved', 'rejected'], description: 'Direktor qarori' })
  @IsEnum(['approved', 'rejected'] as const)
  decision!: 'approved' | 'rejected';

  // Optional when approving, mandatory when rejecting. The service enforces the
  // second half, because "why was I refused?" has to have an answer.
  @ApiPropertyOptional({ maxLength: 500, description: 'Rad etilganda majburiy' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note?: string;
}

export class PayoutMarkPaidDto {
  @ApiProperty({
    example: '2026-08-31',
    description:
      'To‘lov sanasi. Davr shu sanadan kelib chiqadi, shuning uchun so‘rov davri ichida bo‘lishi shart.',
  })
  @Matches(ISO_DATE_PATTERN, { message: 'paidOn YYYY-MM-DD bo‘lishi kerak' })
  paidOn!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PayoutCancelDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
