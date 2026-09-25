import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@/common';
import { AuditService, type AuditLogPageDto } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@ApiTags('audit')
@ApiCookieAuth('cookie')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Redacted audit jurnali — faqat o‘qish' })
  @ApiResponse({ status: 200, description: 'Paginated audit metadata' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — audit.view yo‘q' })
  list(@Query() query: AuditLogQueryDto): Promise<AuditLogPageDto> {
    return this.audit.list(query.page, query.pageSize, query.action);
  }
}
