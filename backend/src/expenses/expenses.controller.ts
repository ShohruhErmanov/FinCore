import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import { ExpenseCreateDto, ExpenseListQueryDto, ExpenseUpdateDto } from './dto/expense.dto';
import { ExpensesService, type ExpenseDto, type PaginatedExpenses } from './expenses.service';

/**
 * Permission codes match the mock backend exactly: viewing needs either branch
 * scope, creating needs expense.create, editing needs expense.edit.
 */
@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions('expense.view_own_branch')
  @ApiOperation({ summary: 'Xarajat jurnali (filtr + sahifalash)' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseListQueryDto,
  ): Promise<PaginatedExpenses> {
    return this.expenses.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('expense.view_own_branch')
  @ApiOperation({ summary: 'Bitta xarajat' })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<ExpenseDto> {
    return this.expenses.detail(user, id);
  }

  @Post()
  @RequirePermissions('expense.create')
  @ApiOperation({ summary: 'Yangi xarajat' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ExpenseCreateDto,
  ): Promise<ExpenseDto> {
    return this.expenses.create(user, idempotencyKey, body);
  }

  @Patch(':id')
  @RequirePermissions('expense.edit')
  @ApiOperation({ summary: 'Xarajatni tahrirlash' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ExpenseUpdateDto,
  ): Promise<ExpenseDto> {
    return this.expenses.update(user, id, body);
  }
}
