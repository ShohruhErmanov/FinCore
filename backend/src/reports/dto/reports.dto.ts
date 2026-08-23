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
