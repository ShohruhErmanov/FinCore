import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import { MasterCreateDto, MasterUpdateDto } from '@/admin/dto/admin.dto';
import { MasterWriteService } from './master-write.service';
import {
  MasterDataService,
  type AccountingPeriodDto,
  type BranchDto,
  type ExpenseCategoryDto,
  type MasterItemDto,
} from './master-data.service';

/**
 * Reference data the app shell loads right after sign-in.
 *
 * Authentication only — no @RequirePermissions. That matches the contract the
 * mock backend defines: every one of these routes calls requireUser() and
 * nothing more. Branch visibility is enforced by scope, not by permission.
 */
@ApiTags('master-data')
@Controller()
export class MasterDataController {
  constructor(
    private readonly masterData: MasterDataService,
    private readonly masterWrite: MasterWriteService,
  ) {}

  @Get('branches')
  @ApiOperation({ summary: 'Foydalanuvchi ko‘ra oladigan filiallar' })
  branches(@CurrentUser() user: AuthenticatedUser): Promise<BranchDto[]> {
    return this.masterData.branches(user.branchScopes);
  }

  @Get('periods')
  @ApiOperation({ summary: 'Hisobot davrlari' })
  periods(): Promise<AccountingPeriodDto[]> {
    return this.masterData.periods();
  }

  @Get('master/categories')
  @ApiOperation({ summary: 'Xarajat kategoriyalari' })
  categories(): Promise<ExpenseCategoryDto[]> {
    return this.masterData.expenseCategories();
  }

  @Get('master/departments')
  @ApiOperation({ summary: 'Bo‘limlar' })
  departments(): Promise<MasterItemDto[]> {
    return this.masterData.departments();
  }

  @Get('master/payment-methods')
  @ApiOperation({ summary: 'To‘lov usullari' })
  paymentMethods(): Promise<MasterItemDto[]> {
    return this.masterData.paymentMethods();
  }
  @Post('master/:kind')
  @RequirePermissions('master_data.manage')
  @ApiOperation({ summary: 'Yangi master-data yozuvi' })
  @ApiParam({ name: 'kind', enum: ['categories', 'departments', 'payment-methods'] })
  @ApiBody({ type: MasterCreateDto })
  @ApiResponse({ status: 201, description: 'Yaratilgan yozuv' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — master_data.manage yoq' })
  @ApiResponse({ status: 404, description: 'MASTER_KIND_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_REFERENCE' })
  createMaster(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Body() body: MasterCreateDto,
  ): Promise<MasterItemDto | ExpenseCategoryDto> {
    return this.masterWrite.create(user, kind, body);
  }

  @Patch('master/:kind/:id')
  @RequirePermissions('master_data.manage')
  @ApiOperation({ summary: 'Master-data yozuvini tahrirlash' })
  @ApiParam({ name: 'kind', enum: ['categories', 'departments', 'payment-methods'] })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: MasterUpdateDto })
  @ApiResponse({ status: 200, description: 'Yangilangan yozuv' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — master_data.manage yoq' })
  @ApiResponse({ status: 404, description: 'MASTER_KIND_NOT_FOUND / MASTER_ITEM_NOT_FOUND' })
  updateMaster(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MasterUpdateDto,
  ): Promise<MasterItemDto | ExpenseCategoryDto> {
    return this.masterWrite.update(user, kind, id, body);
  }
}
