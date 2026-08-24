import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsUUID, Matches, ValidateIf, ValidateNested } from 'class-validator';

/** null clears the branch's plan; "0" is a real plan of zero. */
export class RevenuePlanLineInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional({ nullable: true, example: '80000000' })
  @ValidateIf((line: RevenuePlanLineInputDto) => line.plannedAmountUzs !== null)
  @Matches(/^\d+$/, {
    message: 'plannedAmountUzs null yoki manfiy bo‘lmagan butun son-string bo‘lishi kerak',
  })
  plannedAmountUzs!: string | null;
}

export class SaveRevenuePlanDto {
  @ApiProperty({ type: [RevenuePlanLineInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevenuePlanLineInputDto)
  lines!: RevenuePlanLineInputDto[];
}
