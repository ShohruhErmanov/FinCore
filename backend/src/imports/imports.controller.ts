import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '@/common';
import { ImportExpensesDto } from './dto/import.dto';
import { ImportsService, type ImportSummaryDto } from './imports.service';

/**
 * The workbook is parsed in the browser (src/features/imports/excel-import.ts);
 * this endpoint receives already-normalised JSON rows, not a file upload.
 */
@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('expenses')
  @HttpCode(200)
  @RequirePermissions('import.run')
  @ApiOperation({ summary: 'Excel’dan xarajat import qilish (qator darajasida qisman muvaffaqiyat)' })
  @ApiBody({ type: ImportExpensesDto })
  @ApiResponse({ status: 200, description: 'ImportSummary — imported / skipped / rejected / totalUzs' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — import.run yo‘q' })
  @ApiResponse({ status: 422, description: 'IMPORT_EMPTY' })
  importExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ImportExpensesDto,
  ): Promise<ImportSummaryDto> {
    return this.imports.importExpenses(user, body.rows);
  }
}
