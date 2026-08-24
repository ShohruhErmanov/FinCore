import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class YearQueryDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class MonthlyQueryDto extends YearQueryDto {
  @ApiPropertyOptional({ description: 'Filial UUID yoki "all"' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class CashiersQueryDto {
  @ApiProperty({ description: 'Hisob davri UUID' })
  @IsUUID()
  period!: string;

  @ApiPropertyOptional({ description: 'Filial UUID yoki "all"' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class DashboardQueryDto {
  @ApiProperty({ description: 'Hisob davri UUID' })
  @IsUUID()
  period!: string;

  @ApiPropertyOptional({ description: 'Filial UUID yoki "all"' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ enum: ['daily', 'weekly', 'monthly'] })
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly'])
  granularity?: 'daily' | 'weekly' | 'monthly';
}

export class CashierRowResponseDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ format: 'uuid' }) branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ example: '4500000' }) fixedSalaryUzs!: string;
  @ApiProperty({ example: '100000000' }) planUzs!: string;
  @ApiProperty({ example: '85000000' }) actualUzs!: string;
  @ApiProperty({ example: '-15000000' }) varianceUzs!: string;
  @ApiProperty({ nullable: true, example: 85 }) completionPct!: number | null;
  @ApiProperty({ nullable: true, example: 42.5 }) branchSharePct!: number | null;
  @ApiProperty({ example: 18 }) daysWithEntry!: number;
  @ApiProperty({ nullable: true, example: 5.29 }) salaryToRevenuePct!: number | null;
}

export class CashierBranchGroupResponseDto {
  @ApiProperty({ format: 'uuid' }) branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty() planUzs!: string;
  @ApiProperty() actualUzs!: string;
  @ApiProperty() varianceUzs!: string;
  @ApiProperty({ nullable: true }) completionPct!: number | null;
  @ApiProperty() salaryTotalUzs!: string;
  @ApiProperty({ type: [CashierRowResponseDto] }) cashiers!: CashierRowResponseDto[];
}

export class CashierReportTotalResponseDto {
  @ApiProperty() planUzs!: string;
  @ApiProperty() actualUzs!: string;
  @ApiProperty() varianceUzs!: string;
  @ApiProperty({ nullable: true }) completionPct!: number | null;
  @ApiProperty() salaryTotalUzs!: string;
  @ApiProperty({ nullable: true }) salaryToRevenuePct!: number | null;
  @ApiProperty() activeCashierCount!: number;
}

export class CashierReportResponseDto {
  @ApiProperty() periodLabel!: string;
  @ApiProperty({ description: 'Filial UUID yoki all' }) branchFilter!: string;
  @ApiProperty({ enum: ['all', 'own'] }) scope!: 'all' | 'own';
  @ApiProperty({ type: [CashierBranchGroupResponseDto] })
  branches!: CashierBranchGroupResponseDto[];
  @ApiProperty({ type: CashierReportTotalResponseDto })
  total!: CashierReportTotalResponseDto;
}
