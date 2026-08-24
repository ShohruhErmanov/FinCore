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
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** One normalised row from the Excel workbook the frontend parses client-side. */
export class ImportExpenseRowDto {
  @ApiProperty({ example: 'Sayxun_kassa', description: 'Manba varaq nomi' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sourceSheet!: string;

  @ApiProperty({ example: 42, description: 'Manba qator raqami' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceRow!: number;

  @ApiProperty({ example: '2026-08-20' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'transactionDate YYYY-MM-DD bo‘lishi kerak' })
  transactionDate!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: '1732500', description: 'Butun so‘m, string' })
  @Matches(/^\d+$/, { message: 'amountUzs musbat butun son-string bo‘lishi kerak' })
  amountUzs!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  paymentMethodId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  departmentId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  responsibleUserId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  // The import preview carries three display-only fields alongside the ids.
  // They are declared so the global forbidNonWhitelisted pipe accepts the
  // payload the frontend already sends; the service resolves names from the
  // database itself and never reads these.
  @ApiPropertyOptional({ description: 'Faqat ko‘rsatish uchun — server e’tiborga olmaydi' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  branchName?: string;

  @ApiPropertyOptional({ description: 'Faqat ko‘rsatish uchun — server e’tiborga olmaydi' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  categoryName?: string;

  @ApiPropertyOptional({ description: 'Sana matn formatidan tiklanganini bildiradi' })
  @IsOptional()
  @IsBoolean()
  recoveredTextDate?: boolean;
}

export class ImportExpensesDto {
  @ApiProperty({ type: [ImportExpenseRowDto], description: 'Excel’dan normallashtirilgan qatorlar' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportExpenseRowDto)
  rows!: ImportExpenseRowDto[];
}
