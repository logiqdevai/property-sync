import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { UserTrackedAgenciesService } from './user-tracked-agencies.service';
import { TrackAgencyDto } from './dto/track-agency.dto';
import { LinkIntegrationDto } from './dto/link-integration.dto';
import {
  BrowseAgencyQuerySchema,
  BrowseAgencyQueryType,
} from './dto/agency-query.schema';

@ApiTags('User Agencies')
@ApiBearerAuth()
@Controller('agencies')
@UseGuards(JwtGuard)
export class UserTrackedAgenciesController {
  constructor(
    private readonly userTrackedAgenciesService: UserTrackedAgenciesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Browse trackable agencies with tracking state' })
  @ApiResponse({ status: 200, description: 'Paginated agency browse list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(BrowseAgencyQuerySchema))
    query: BrowseAgencyQueryType,
  ) {
    return this.userTrackedAgenciesService.findAll(userId, query);
  }

  @Post(':agencyId/track')
  @ApiOperation({ summary: 'Track an agency' })
  @ApiResponse({ status: 201, description: 'Tracked agency created' })
  @ApiResponse({ status: 404, description: 'Agency not found' })
  @ApiResponse({ status: 409, description: 'Already tracking this agency' })
  track(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
    @Body() dto: TrackAgencyDto,
  ) {
    return this.userTrackedAgenciesService.track(userId, agencyId, dto);
  }

  @Patch(':agencyId/track')
  @ApiOperation({ summary: 'Update tracking preferences' })
  @ApiResponse({ status: 200, description: 'Tracking preferences updated' })
  @ApiResponse({ status: 404, description: 'Tracking relationship not found' })
  updateTracking(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
    @Body() dto: TrackAgencyDto,
  ) {
    return this.userTrackedAgenciesService.updateTracking(
      userId,
      agencyId,
      dto,
    );
  }

  @Delete(':agencyId/track')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop tracking an agency' })
  @ApiResponse({ status: 204, description: 'Stopped tracking' })
  @ApiResponse({ status: 404, description: 'Tracking relationship not found' })
  async untrack(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
  ) {
    await this.userTrackedAgenciesService.untrack(userId, agencyId);
  }

  @Get(':agencyId/track/integration')
  @ApiOperation({ summary: 'Get linked integration for a tracked agency' })
  @ApiResponse({ status: 200, description: 'Linked integration or null' })
  @ApiResponse({ status: 404, description: 'Tracking relationship not found' })
  getIntegrationLink(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
  ) {
    return this.userTrackedAgenciesService.getIntegrationLink(userId, agencyId);
  }

  @Put(':agencyId/track/integration')
  @ApiOperation({ summary: 'Link an integration to a tracked agency (1:1)' })
  @ApiResponse({ status: 200, description: 'Integration linked' })
  @ApiResponse({
    status: 404,
    description: 'Tracking or integration not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Integration already linked elsewhere',
  })
  linkIntegration(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
    @Body() dto: LinkIntegrationDto,
  ) {
    return this.userTrackedAgenciesService.linkIntegration(
      userId,
      agencyId,
      dto.user_integration_id,
      dto.integration_client_id,
    );
  }

  @Delete(':agencyId/track/integration')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unlink integration from a tracked agency' })
  @ApiResponse({ status: 204, description: 'Integration unlinked' })
  @ApiResponse({ status: 404, description: 'Tracking relationship not found' })
  async unlinkIntegration(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
  ) {
    await this.userTrackedAgenciesService.unlinkIntegration(userId, agencyId);
  }
}
