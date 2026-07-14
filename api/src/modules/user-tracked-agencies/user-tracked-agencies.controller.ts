import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/shared/pipes/zod.validation.pipe';
import { UserTrackedAgenciesService } from './user-tracked-agencies.service';
import { TrackAgencyDto } from './dto/track-agency.dto';
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
  findAll(
    @CurrentUser('id') userId: string,
    @Query(new ZodValidationPipe(BrowseAgencyQuerySchema))
    query: BrowseAgencyQueryType,
  ) {
    return this.userTrackedAgenciesService.findAll(userId, query);
  }

  @Post(':agencyId/track')
  @ApiOperation({ summary: 'Track an agency' })
  track(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
    @Body() dto: TrackAgencyDto,
  ) {
    return this.userTrackedAgenciesService.track(userId, agencyId, dto);
  }

  @Patch(':agencyId/track')
  @ApiOperation({ summary: 'Update tracking preferences' })
  updateTracking(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
    @Body() dto: TrackAgencyDto,
  ) {
    return this.userTrackedAgenciesService.updateTracking(userId, agencyId, dto);
  }

  @Delete(':agencyId/track')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop tracking an agency' })
  async untrack(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
  ) {
    await this.userTrackedAgenciesService.untrack(userId, agencyId);
  }
}
