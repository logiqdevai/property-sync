import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { AuthRole } from 'generated/prisma';
import { CmsSyncOrchestratorService } from './services/cms-sync-orchestrator.service';

class LinkAndBackfillDto {
  user_integration_id!: string;
  test_connection?: boolean;
}

@ApiTags('CMS Sync')
@ApiBearerAuth()
@Controller('admin/cms-sync')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN, AuthRole.SUPPORT)
export class AdminCmsSyncController {
  constructor(
    private readonly cmsSyncOrchestratorService: CmsSyncOrchestratorService,
  ) {}

  @Post('backfill/:userTrackedAgencyId')
  @ApiOperation({
    summary: 'Enqueue a backfill CMS sync for a tracked agency',
  })
  @ApiResponse({ status: 200, description: 'Backfill enqueued' })
  @ApiParam({ name: 'userTrackedAgencyId', type: String })
  async backfill(@Param('userTrackedAgencyId') userTrackedAgencyId: string) {
    await this.cmsSyncOrchestratorService.planAndEnqueueBackfill(
      userTrackedAgencyId,
    );
    return { ok: true };
  }

  @Post('link-and-backfill/:userTrackedAgencyId')
  @ApiOperation({
    summary: 'Link a tracked agency to an integration and enqueue backfill',
  })
  @ApiResponse({ status: 200, description: 'Linked and backfill enqueued' })
  @ApiParam({ name: 'userTrackedAgencyId', type: String })
  @ApiBody({ type: LinkAndBackfillDto })
  async linkAndBackfill(
    @Param('userTrackedAgencyId') userTrackedAgencyId: string,
    @Body() body: LinkAndBackfillDto,
  ) {
    await this.cmsSyncOrchestratorService.linkAndBackfill(
      body.user_integration_id,
      userTrackedAgencyId,
      { testConnection: body.test_connection },
    );
    return { ok: true };
  }
}
