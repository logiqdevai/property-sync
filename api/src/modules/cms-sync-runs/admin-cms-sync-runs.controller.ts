import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole, CmsSyncStatus } from 'generated/prisma';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { CmsSyncRunsService } from './cms-sync-runs.service';
import {
  AdminCmsSyncRunIntegrationsQuerySchema,
  AdminCmsSyncRunIntegrationsQueryType,
  AdminCmsSyncRunQuerySchema,
  AdminCmsSyncRunQueryType,
} from './dto/cms-sync-run-query.schema';

@ApiTags('CMS Sync Runs')
@ApiBearerAuth()
@Controller('admin/cms-sync-runs')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class AdminCmsSyncRunsController {
  constructor(private readonly cmsSyncRunsService: CmsSyncRunsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List CMS sync runs (paginated, filterable by user, integration, status, date range)',
  })
  @ApiResponse({ status: 200, description: 'Paginated CMS sync run list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: CmsSyncStatus })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  @ApiQuery({ name: 'user_integration_id', required: false, type: String })
  @ApiQuery({ name: 'date_from', required: false, type: String })
  @ApiQuery({ name: 'date_to', required: false, type: String })
  findAll(
    @Query(new ZodValidationPipe(AdminCmsSyncRunQuerySchema))
    query: AdminCmsSyncRunQueryType,
  ) {
    return this.cmsSyncRunsService.findAll(query);
  }

  @Get('integrations')
  @ApiOperation({
    summary: 'List EstateWeb integrations for sync-run filter dropdowns',
  })
  @ApiResponse({ status: 200, description: 'EstateWeb user integrations' })
  @ApiQuery({ name: 'user_id', required: false, type: String })
  listIntegrations(
    @Query(new ZodValidationPipe(AdminCmsSyncRunIntegrationsQuerySchema))
    query: AdminCmsSyncRunIntegrationsQueryType,
  ) {
    return this.cmsSyncRunsService.listEstateWebIntegrations(query);
  }
}
