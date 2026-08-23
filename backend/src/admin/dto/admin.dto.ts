import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const ROLE_CODES = ['cashier', 'finance_manager', 'director'] as const;
type RoleCode = (typeof ROLE_CODES)[number];

export class UserCreateDto {
  @ApiProperty({ example: 'Ergashev Abdulla' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({ example: '+998 90 123 45 67' })
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone!: string;

  @ApiProperty({ enum: ROLE_CODES })
  @IsIn(ROLE_CODES)
  role!: RoleCode;

  @ApiPropertyOptional({ nullable: true, description: 'Kassir uchun majburiy filial' })
  @ValidateIf((dto: UserCreateDto) => dto.branchId !== null && dto.branchId !== undefined)
  @IsUUID()
  branchId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Moliya rahbariga qo‘shimcha kassir scope' })
  @ValidateIf((dto: UserCreateDto) => dto.cashierBranchId !== null && dto.cashierBranchId !== undefined)
  @IsUUID()
  cashierBranchId?: string | null;

  /**
   * Minimum 12 characters — the same policy `npm run bootstrap:users` enforces,
   * so an account created through the UI is no weaker than a seeded one.
   * writeOnly: it is hashed on arrival and never appears in any response.
   */
  @ApiProperty({ writeOnly: true, minLength: 12, description: 'Kamida 12 belgi' })
  @IsString()
  @MinLength(12, { message: 'Parol kamida 12 belgidan iborat bo‘lishi kerak' })
  @MaxLength(200)
  password!: string;

  @ApiProperty({ writeOnly: true, description: 'Parol bilan bir xil bo‘lishi shart' })
  @IsString()
  confirmPassword!: string;
}

export class RoleAssignmentDto {
  @ApiProperty({ enum: ROLE_CODES })
  @IsIn(ROLE_CODES)
  role!: RoleCode;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((dto: RoleAssignmentDto) => dto.branchId !== null && dto.branchId !== undefined)
  @IsUUID()
  branchId?: string | null;
}

export class UserAccessDto {
  @ApiProperty({ type: [RoleAssignmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles!: RoleAssignmentDto[];
}

export class UserStatusDto {
  @ApiProperty({ enum: ['active', 'inactive', 'blocked'] })
  @IsIn(['active', 'inactive', 'blocked'])
  status!: 'active' | 'inactive' | 'blocked';
}

export class RolePermissionsDto {
  @ApiProperty({ type: [String], example: ['dashboard.view', 'reports.view'] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

/** Shared by POST /master/:kind and PATCH /master/:kind/:id. */
export class MasterCreateDto {
  @ApiProperty({ example: 'RENT' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @ApiProperty({ example: 'Ijara' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ enum: ['fixed', 'variable'], description: 'Faqat categories uchun' })
  @IsOptional()
  @IsIn(['fixed', 'variable'])
  expenseType?: 'fixed' | 'variable';
}

export class MasterUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: ['fixed', 'variable'] })
  @IsOptional()
  @IsIn(['fixed', 'variable'])
  expenseType?: 'fixed' | 'variable';
}
