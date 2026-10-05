import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const ROLE_CODES = ['cashier', 'finance_manager', 'director', 'investor'] as const;
type RoleCode = (typeof ROLE_CODES)[number];
const INVESTOR_CAPITAL_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER'] as const;

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
  @ValidateIf(
    (dto: UserCreateDto) => dto.cashierBranchId !== null && dto.cashierBranchId !== undefined,
  )
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

  /**
   * Investor uchun majburiy: kompaniyadagi ulush foizi. Bu — olingan summa
   * foizi EMAS; ikkovi butunlay boshqa ko‘rsatkich.
   */
  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 100 })
  @ValidateIf((dto: UserCreateDto) => dto.role === 'investor')
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'ownershipPercent 0–100 oralig‘ida son bo‘lishi kerak' },
  )
  @Min(0)
  @Max(100)
  ownershipPercent?: number;

  @ApiPropertyOptional({
    example: '100000000',
    description: 'Investor kompaniyaga kiritgan boshlang‘ich kapital, butun so‘m',
  })
  @ValidateIf((dto: UserCreateDto) => dto.role === 'investor')
  @Matches(/^[1-9]\d*$/, { message: 'Mablag‘ 0 dan katta butun so‘m bo‘lishi kerak' })
  capitalAmountUzs?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Foyda ulushi boshlanadigan hisob davri' })
  @ValidateIf((dto: UserCreateDto) => dto.role === 'investor')
  @IsUUID()
  startPeriodId?: string;

  @ApiPropertyOptional({ enum: INVESTOR_CAPITAL_PAYMENT_METHODS })
  @ValidateIf((dto: UserCreateDto) => dto.role === 'investor')
  @IsIn(INVESTOR_CAPITAL_PAYMENT_METHODS, {
    message: 'To‘lov shakli CASH, CARD yoki BANK_TRANSFER bo‘lishi kerak',
  })
  capitalPaymentMethodCode?: (typeof INVESTOR_CAPITAL_PAYMENT_METHODS)[number];

  /**
   * Ixtiyoriy: joriy ochiq davr uchun tegishli summa. Entitlement har davr
   * uchun alohida yoziladi, shuning uchun bu faqat birinchi davrni to‘ldiradi —
   * qolgan oylar investor sahifasidan kiritiladi.
   */
  @ApiPropertyOptional({ example: '10000000', description: 'Joriy davr uchun tegishli summa' })
  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'entitledAmountUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak',
  })
  entitledAmountUzs?: string;
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

/**
 * A new password for an existing account. Same policy as UserCreateDto.
 * Every field is writeOnly: it is hashed on arrival and never returned.
 */
export class UserPasswordDto {
  @ApiProperty({ writeOnly: true, minLength: 12, description: 'Kamida 12 belgi' })
  @IsString()
  @MinLength(12, { message: 'Parol kamida 12 belgidan iborat bo‘lishi kerak' })
  @MaxLength(200)
  password!: string;

  @ApiProperty({ writeOnly: true, description: 'Parol bilan bir xil bo‘lishi shart' })
  @IsString()
  confirmPassword!: string;

  /** Only when changing your own password; an admin reset of someone else needs none. */
  @ApiPropertyOptional({ writeOnly: true, description: 'Faqat o‘z parolini o‘zgartirganda' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string;
}

export class UserSalaryDto {
  @ApiProperty({ example: '4500000', description: 'Belgilangan oylik, butun so‘m string' })
  @Matches(/^\d+$/, {
    message: 'fixedSalaryUzs manfiy bo‘lmagan butun son-string bo‘lishi kerak',
  })
  fixedSalaryUzs!: string;
}

export class RoleAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  roleName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  branchId!: string | null;

  @ApiProperty({ nullable: true })
  branchName!: string | null;
}

export class AuthenticatedUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty({ enum: ['active', 'inactive', 'blocked'] })
  status!: 'active' | 'inactive' | 'blocked';

  @ApiProperty({ type: [RoleAssignmentResponseDto] })
  roles!: RoleAssignmentResponseDto[];

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  branchScopes!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  writeBranchScopes!: string[];

  @ApiProperty({ example: '4500000' })
  fixedSalaryUzs!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastLoginAt!: string | null;
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

/** Creates the twelve real accounting periods that make a year selectable app-wide. */
export class AccountingYearCreateDto {
  @ApiProperty({ example: 2027, minimum: 2000, maximum: 2100 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 }, { message: 'Yil butun son bo‘lishi kerak' })
  @Min(2000, { message: 'Yil 2000 dan kichik bo‘lishi mumkin emas' })
  @Max(2100, { message: 'Yil 2100 dan katta bo‘lishi mumkin emas' })
  year!: number;
}
