import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** null clears the plan for that cell; "0" is a real plan of zero. */
export class BudgetLineInputDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ nullable: true, example: '5000000' })
  // null is a valid value, not a missing one: it clears the plan for that cell.
  @ValidateIf((line: BudgetLineInputDto) => line.plannedAmountUzs !== null)
  @Matches(/^\d+$/, {
    message: 'plannedAmountUzs null yoki manfiy bo‘lmagan butun son-string bo‘lishi kerak',
  })
  plannedAmountUzs!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 1000,
    example: 'Avgust uchun tasdiqlangan reja',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

export class SaveBudgetLinesDto {
  @ApiProperty({ type: [BudgetLineInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetLineInputDto)
  lines!: BudgetLineInputDto[];
}

export class BudgetHistoryQueryDto {
  @ApiPropertyOptional({ example: 2026, minimum: 2000, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
