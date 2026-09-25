import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Integer so'm as a string, so a BIGINT amount never passes through a float. */
const MONEY = /^\d+$/;

export class InvestorYearQueryDto {
  @ApiPropertyOptional({ example: 2026, minimum: 2000, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class InvestorCreateDto {
  @ApiProperty({ format: 'uuid', description: 'Investor sifatida qayd etiladigan foydalanuvchi' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 2, minimum: 0, maximum: 100, description: 'Kompaniyadagi ulush foizi' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ownershipPercent!: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Bo‘sh = butun kompaniya bo‘yicha' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InvestorUpdateDto {
  @ApiPropertyOptional({ example: 2.5, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ownershipPercent?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InvestorEntitlementDto {
  @ApiProperty({ format: 'uuid', description: 'Hisob davri' })
  @IsUUID()
  periodId!: string;

  @ApiProperty({ example: '10000000', description: 'Shu davr uchun investorga tegishli summa (butun so‘m)' })
  @Matches(MONEY, { message: 'entitledAmountUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  entitledAmountUzs!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InvestorPaymentDto {
  @ApiProperty({ example: '2026-08-20' })
  @Matches(ISO_DATE, { message: 'paidOn YYYY-MM-DD bo‘lishi kerak' })
  paidOn!: string;

  @ApiProperty({ example: '8000000', description: 'To‘langan summa (butun so‘m, noldan katta)' })
  @Matches(MONEY, { message: 'amountUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  amountUzs!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReversePaymentDto {
  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Bekor qilish sababi — audit uchun majburiy' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
