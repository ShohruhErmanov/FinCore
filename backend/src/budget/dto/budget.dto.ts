import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsUUID, Matches, ValidateIf, ValidateNested } from 'class-validator';

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
}

export class SaveBudgetLinesDto {
  @ApiProperty({ type: [BudgetLineInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetLineInputDto)
  lines!: BudgetLineInputDto[];
}
