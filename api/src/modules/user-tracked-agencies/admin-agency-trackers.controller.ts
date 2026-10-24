import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthRole } from 'generated/prisma';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { RolesGuard } from '@/shared/guards/roles.guard';
import { Roles } from '@/shared/decorators/roles.decorator';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { Audited } from '@/modules/activity-logs/decorators/audited.decorator';
import {
  contentPublishingConfigOfAdminTarget,
  trackedAgencyOfAdminTarget,
} from '@/modules/activity-logs/entities/audit-id-resolvers';
import { CreateUserIntegrationDto } from '@/modules/user-integrations/dto/user-integration.dto';
import { UpsertContentPublishingConfigDto } from '@/modules/content-publishing/dto/upsert-content-publishing-config.dto';
import { ContentPublishingConfigService } from '@/modules/content-publishing/services/content-publishing-config.service';
import { AdminAgencyTrackersService } from './admin-agency-trackers.service';
import {
  AdminSearchIntegrationClientsQueryDto,
  AdminSetIntegrationClientDto,
  AdminTrackAgencyUsersDto,
} from './dto/admin-agency-trackers.dto';

/** Admin-on-behalf actions for the "New agency" onboarding wizard. */
@ApiTags('Agencies')
@ApiBearerAuth()
@Controller('admin/agencies/:id/trackers')
@UseGuards(JwtGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AdminAgencyTrackersController {
  constructor(
    private readonly adminAgencyTrackersService: AdminAgencyTrackersService,
    private readonly contentPublishingConfigService: ContentPublishingConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users tracking an agency, with their CRM link' })
  list(@Param('id') id: string) {
    return this.adminAgencyTrackersService.listTrackers(id);
  }

  @Audited({ action: 'agency.trackers_add' })
  @Post()
  @ApiOperation({ summary: 'Track an agency on behalf of several users' })
  @ApiResponse({ status: 201, description: 'Per-user tracking results' })
  trackUsers(@Param('id') id: string, @Body() dto: AdminTrackAgencyUsersDto) {
    return this.adminAgencyTrackersService.trackUsers(id, dto.user_ids);
  }

  @Get(':userId/content-publishing')
  @ApiOperation({ summary: "Get a user's content publishing config for this agency" })
  getContentPublishing(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.contentPublishingConfigService.getForTrackedAgency(userId, id);
  }

  @Audited({
    action: 'content_publishing.admin_upsert',
    entity: 'ContentPublishingConfig',
    ids: contentPublishingConfigOfAdminTarget,
  })
  @Put(':userId/content-publishing')
  @ApiOperation({ summary: "Create or replace a user's content publishing config" })
  upsertContentPublishing(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpsertContentPublishingConfigDto,
  ) {
    return this.contentPublishingConfigService.upsertForTrackedAgency(
      userId,
      id,
      dto,
    );
  }

  @Audited({
    action: 'content_publishing.admin_delete',
    entity: 'ContentPublishingConfig',
    ids: contentPublishingConfigOfAdminTarget,
  })
  @Delete(':userId/content-publishing')
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a user's content publishing config" })
  async removeContentPublishing(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.contentPublishingConfigService.deleteForTrackedAgency(userId, id);
  }

  @Audited({
    action: 'tracked_agency.admin_estateweb_connect',
    entity: 'UserTrackedAgency',
    ids: trackedAgencyOfAdminTarget,
  })
  @Post(':userId/estateweb')
  @ApiOperation({
    summary: 'Create an EstateWeb account for a user and link it to their tracked agency',
  })
  connectEstateWeb(
    @CurrentUser('role') role: AuthRole,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: CreateUserIntegrationDto,
  ) {
    return this.adminAgencyTrackersService.connectEstateWeb(id, userId, role, dto);
  }

  @Get(':userId/crm-clients')
  @ApiOperation({ summary: "Search CRM clients through the user's EstateWeb account" })
  searchClients(
    @Param('userId') userId: string,
    @Query() query: AdminSearchIntegrationClientsQueryDto,
  ) {
    return this.adminAgencyTrackersService.searchClients(userId, query.last_name);
  }

  @Audited({
    action: 'tracked_agency.admin_client_set',
    entity: 'UserTrackedAgency',
    ids: trackedAgencyOfAdminTarget,
  })
  @Put(':userId/crm-client')
  @ApiOperation({ summary: "Set the CRM client id on a user's linked tracked agency" })
  setClient(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: AdminSetIntegrationClientDto,
  ) {
    return this.adminAgencyTrackersService.setIntegrationClient(
      id,
      userId,
      dto.integration_client_id ?? null,
    );
  }
}
