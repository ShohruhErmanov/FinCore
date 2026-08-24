import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Money crosses the wire as an integer string; a JS number would lose precision. */
const MONEY = /^\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DailyRevenueCreateDto {
  @ApiProperty({ example: '2026-08-20', description: 'Biznes sanasi (Asia/Tashkent)' })
  @Matches(ISO_DATE, { message: 'businessDate YYYY-MM-DD bo‘lishi kerak' })
  @IsDateString({ strict: true, strictSeparator: true }, { message: 'businessDate haqiqiy sana bo‘lishi kerak' })
  businessDate!: string;

  @ApiPropertyOptional({ description: 'Berilmasa foydalanuvchining yozish scope’i ishlatiladi' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: '1200000', description: 'Naqd, butun so‘m' })
  @Matches(MONEY, { message: 'cashUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  cashUzs!: string;

  @ApiProperty({ example: '800000', description: 'Plastik karta, butun so‘m' })
  @Matches(MONEY, { message: 'cardUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  cardUzs!: string;

  @ApiProperty({ example: '0', description: 'Bank o‘tkazmasi, butun so‘m' })
  @Matches(MONEY, { message: 'transferUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  transferUzs!: string;

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

export class DailyRevenueUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY, { message: 'cashUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  cashUzs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY, { message: 'cardUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  cardUzs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(MONEY, { message: 'transferUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  transferUzs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  // The revenue form reuses the create payload, so these two may arrive on a
  // PATCH as well. They are accepted and ignored: the logical identity of a
  // DailyRevenue is (branch, businessDate) and PATCH never moves a day.
  @ApiPropertyOptional({ description: 'Qabul qilinadi, lekin e’tiborga olinmaydi' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'businessDate YYYY-MM-DD bo‘lishi kerak' })
  @IsDateString({ strict: true, strictSeparator: true }, { message: 'businessDate haqiqiy sana bo‘lishi kerak' })
  businessDate?: string;

  @ApiPropertyOptional({ description: 'Qabul qilinadi, lekin e’tiborga olinmaydi' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Qabul qilinadi, lekin e’tiborga olinmaydi' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

/** Every filter accepts the literal "all", which the ledger UI sends for "no filter". */
export class DailyRevenueListQueryDto {
  @IsOptional()
  @IsString()
  @ValidateIf((_dto, value) => value !== 'all')
  @IsUUID()
  branch?: string;

  @IsOptional() @IsUUID() periodId?: string;
  @IsOptional() @Matches(ISO_DATE) @IsDateString({ strict: true, strictSeparator: true }) dateFrom?: string;
  @IsOptional() @Matches(ISO_DATE) @IsDateString({ strict: true, strictSeparator: true }) dateTo?: string;
  @IsOptional() @IsString() sort?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

export class ReminderPreviewQueryDto {
  @ApiPropertyOptional({ example: '2026-08-20', description: 'Berilmasa bugungi sana' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'date YYYY-MM-DD bo‘lishi kerak' })
  @IsDateString({ strict: true, strictSeparator: true }, { message: 'date haqiqiy sana bo‘lishi kerak' })
  date?: string;
}

/** Concrete classes below exist so Swagger emits the frontend's real wire schema. */
export class DailyRevenueResponseDto {
  @ApiProperty({ example: 'daily-11111111-1111-4111-8111-111111111111-2026-08-20' })
  id!: string;

  @ApiProperty({ format: 'date', example: '2026-08-20' })
  businessDate!: string;

  @ApiProperty({ format: 'uuid' })
  periodId!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ example: '1200000' })
  cashUzs!: string;

  @ApiProperty({ example: '800000' })
  cardUzs!: string;

  @ApiProperty({ example: '0' })
  transferUzs!: string;

  @ApiProperty({ example: '2000000' })
  totalUzs!: string;

  @ApiProperty({ nullable: true })
  comment!: string | null;

  @ApiProperty({ format: 'uuid' })
  enteredBy!: string;

  @ApiProperty()
  enteredByName!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class PaginatedDailyRevenueResponseDto {
  @ApiProperty({ type: [DailyRevenueResponseDto] })
  items!: DailyRevenueResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ nullable: true, example: '2' })
  nextCursor!: string | null;
}
