import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsUUID, Matches, ValidateNested } from 'class-validator';

export class CategoryBaselineLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({ example: '7200000', description: 'Butun so‘m, string' })
  @Matches(/^\d+$/, { message: 'amountUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak' })
  amountUzs!: string;
}

export class CategoryBaselinesInputDto {
  @ApiProperty({ type: [CategoryBaselineLineDto] })
  @IsArray()
  // The grid is at most every category times every branch; anything larger is
  // not a settings edit.
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CategoryBaselineLineDto)
  lines!: CategoryBaselineLineDto[];
}

export class CategoryBaselineBranchResponseDto {
  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class CategoryBaselineRowResponseDto {
  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['fixed', 'variable'] })
  expenseType!: 'fixed' | 'variable';

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ description: 'branchId → butun so‘m string', type: 'object', additionalProperties: { type: 'string' } })
  amounts!: Record<string, string>;

  @ApiProperty({ example: '27200000' })
  totalUzs!: string;
}

export class CategoryBaselineBoardResponseDto {
  @ApiProperty({ type: [CategoryBaselineBranchResponseDto] })
  branches!: CategoryBaselineBranchResponseDto[];

  @ApiProperty({ type: [CategoryBaselineRowResponseDto] })
  rows!: CategoryBaselineRowResponseDto[];

  @ApiProperty({
    description: 'Ustun jamlari va umumiy «Jami oylik reja (byudjet)»',
    example: { byBranch: { '…': '103748000' }, grandTotalUzs: '198726000' },
  })
  totals!: { byBranch: Record<string, string>; grandTotalUzs: string };
}
