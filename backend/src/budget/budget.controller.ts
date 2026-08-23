import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import { SaveBudgetLinesDto } from './dto/budget.dto';
import { BudgetService, type BudgetPlanDto } from './budget.service';

/**
 * Permission codes match the mock backend: budget.view to read, budget.create_edit
 * to save. Budget planning is company-wide, so no branch scope filter is applied
 * — the mock returns every branch's column to any user who may see the plan.
 */
@ApiTags('budget')
@Controller('budget-plans')
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get(':periodId')
  @RequirePermissions('budget.view')
  @ApiOperation({ summary: 'Davr budjeti: kategoriya × filial matritsasi' })
  @ApiParam({ name: 'periodId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Reja, fakt va variansiya bilan to‘liq matritsa' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — budget.view yo‘q' })
  @ApiResponse({ status: 404, description: 'PERIOD_NOT_FOUND' })
  get(@Param('periodId', ParseUUIDPipe) periodId: string): Promise<BudgetPlanDto> {
    return this.budget.get(periodId);
  }

  @Put(':periodId/lines')
  @RequirePermissions('budget.create_edit')
  @ApiOperation({ summary: 'Budjet qatorlarini saqlash' })
  @ApiParam({ name: 'periodId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Yangilangan matritsa' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — budget.create_edit yo‘q' })
  @ApiResponse({ status: 404, description: 'PERIOD_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'PERIOD_CLOSED' })
  saveLines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body() body: SaveBudgetLinesDto,
  ): Promise<BudgetPlanDto> {
    return this.budget.saveLines(user, periodId, body.lines);
  }
}
