import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Money crosses the wire as an integer string; a JS number would lose precision. */
const MONEY = /^\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ExpenseCreateDto {
  @ApiProperty({ example: '2026-08-20' })
  @Matches(ISO_DATE, { message: 'transactionDate YYYY-MM-DD bo‘lishi kerak' })
  transactionDate!: string;

  @ApiPropertyOptional({ description: 'Berilmasa foydalanuvchining yozish scope’i ishlatiladi' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: '1732500', description: 'Butun so‘m, string' })
  @Matches(MONEY, { message: 'amountUzs musbat butun son-string bo‘lishi kerak' })
  amountUzs!: string;

  @ApiProperty()
  @IsUUID()
  paymentMethodId!: string;

  @ApiProperty()
  @IsUUID()
  departmentId!: string;

  @ApiProperty()
  @IsUUID()
  responsibleUserId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiProperty({ description: 'Idempotency-Key header bilan bir xil bo‘lishi shart' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;
}

export class ExpenseUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(ISO_DATE, { message: 'transactionDate YYYY-MM-DD bo‘lishi kerak' })
  transactionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY, { message: 'amountUzs musbat butun son-string bo‘lishi kerak' })
  amountUzs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** Every filter accepts the literal "all", which the ledger UI sends for "no filter". */
export class ExpenseListQueryDto {
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() expenseType?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() paymentMethodId?: string;
  @IsOptional() @IsString() responsibleUserId?: string;
  @IsOptional() @IsString() enteredByUserId?: string;
  @IsOptional() @IsString() year?: string;
  @IsOptional() @IsString() month?: string;
  @IsOptional() @IsISO8601() dateFrom?: string;
  @IsOptional() @IsISO8601() dateTo?: string;
  @IsOptional() @IsString() sort?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
