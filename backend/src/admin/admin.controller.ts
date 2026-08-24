import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import {
  RolePermissionsDto,
  AuthenticatedUserResponseDto,
  UserAccessDto,
  UserCreateDto,
  UserSalaryDto,
  UserStatusDto,
} from './dto/admin.dto';
import { AdminRolesService, type RolePermissionMatrix } from './roles.service';
import { AdminUsersService, type UserDirectoryItemDto } from './users.service';

/**
 * Permission codes are the mock's: the directory is readable by any signed-in
 * user (scope-filtered), everything else needs user.manage or role.manage.
 */
@ApiTags('admin')
@ApiCookieAuth('cookie')
@Controller()
export class AdminController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly roles: AdminRolesService,
  ) {}

  @Get('users/directory')
  @ApiOperation({ summary: 'Mas’ul xodimlar ro‘yxati (filial scope bo‘yicha filtrlanadi)' })
  @ApiResponse({ status: 200, description: 'UserDirectoryItem[]' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  directory(@CurrentUser() user: AuthenticatedUser): Promise<UserDirectoryItemDto[]> {
    return this.users.directory(user);
  }

  @Get('admin/users')
  @RequirePermissions('user.manage')
  @ApiOperation({ summary: 'Barcha foydalanuvchilar to‘liq proyeksiyasi' })
  @ApiResponse({ status: 200, description: 'AuthenticatedUser[]' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — user.manage yo‘q' })
  list(): Promise<AuthenticatedUser[]> {
    return this.users.list();
  }

  @Post('users')
  @RequirePermissions('user.manage')
  @ApiOperation({ summary: 'Yangi foydalanuvchi va rol biriktirish' })
  @ApiBody({ type: UserCreateDto })
  @ApiResponse({ status: 201, description: 'AuthenticatedUser' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN / PRIVILEGE_ESCALATION_DENIED' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_REFERENCE' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: UserCreateDto,
  ): Promise<AuthenticatedUser> {
    return this.users.create(actor, body);
  }

  @Put('users/:id/access')
  @RequirePermissions('user.manage')
  @ApiOperation({ summary: 'Foydalanuvchi rollarini almashtirish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'AuthenticatedUser' })
  @ApiResponse({ status: 403, description: 'PRIVILEGE_ESCALATION_DENIED' })
  @ApiResponse({ status: 404, description: 'USER_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_ROLE / LAST_DIRECTOR_REQUIRED' })
  updateAccess(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UserAccessDto,
  ): Promise<AuthenticatedUser> {
    return this.users.updateAccess(actor, id, body);
  }

  @Patch('users/:id/status')
  @RequirePermissions('user.manage')
  @ApiOperation({ summary: 'Foydalanuvchi statusini o‘zgartirish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'AuthenticatedUser' })
  @ApiResponse({ status: 403, description: 'PRIVILEGE_ESCALATION_DENIED' })
  @ApiResponse({ status: 404, description: 'USER_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'LAST_DIRECTOR_REQUIRED' })
  updateStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UserStatusDto,
  ): Promise<AuthenticatedUser> {
    return this.users.updateStatus(actor, id, body);
  }

  @Patch('users/:id/salary')
  @RequirePermissions('user.manage')
  @ApiOperation({ summary: 'Foydalanuvchining belgilangan oyligini o‘zgartirish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UserSalaryDto })
  @ApiOkResponse({
    type: AuthenticatedUserResponseDto,
    description: 'AuthenticatedUser — yangilangan fixedSalaryUzs bilan',
  })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — user.manage yo‘q' })
  @ApiResponse({ status: 404, description: 'USER_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'AMOUNT_INVALID' })
  updateSalary(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UserSalaryDto,
  ): Promise<AuthenticatedUser> {
    return this.users.updateSalary(actor, id, body);
  }

  @Get('roles/permissions')
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Rol → ruxsat matritsasi' })
  @ApiResponse({ status: 200, description: 'Record<RoleCode, PermissionCode[]>' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — role.manage yo‘q' })
  matrix(): Promise<RolePermissionMatrix> {
    return this.roles.matrix();
  }

  @Put('roles/:role/permissions')
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Rol ruxsatlarini almashtirish (faqat direktor)' })
  @ApiParam({ name: 'role', enum: ['cashier', 'finance_manager', 'director'] })
  @ApiResponse({ status: 200, description: '{ role, permissions }' })
  @ApiResponse({ status: 403, description: 'PRIVILEGE_ESCALATION_DENIED' })
  @ApiResponse({ status: 404, description: 'ROLE_NOT_FOUND' })
  @ApiResponse({ status: 422, description: 'PERMISSION_UNKNOWN' })
  replacePermissions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('role') role: string,
    @Body() body: RolePermissionsDto,
  ): Promise<{ role: string; permissions: string[] }> {
    return this.roles.replacePermissions(actor, role, body.permissions);
  }
}
