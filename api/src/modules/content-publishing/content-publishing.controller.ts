import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { UpsertContentPublishingConfigDto } from './dto/upsert-content-publishing-config.dto';
import { ContentPublishingConfigEntity } from './entities/content-publishing-config.entity';
import { ContentPublishingConfigService } from './services/content-publishing-config.service';

@ApiTags('Content Publishing')
@ApiBearerAuth()
@Controller('agencies/:agencyId/track/content-publishing')
@UseGuards(JwtGuard)
export class ContentPublishingController {
  constructor(
    private readonly contentPublishingConfigService: ContentPublishingConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get content publishing config for a tracked agency',
  })
  @ApiResponse({ status: 200, type: ContentPublishingConfigEntity })
  @ApiResponse({ status: 404, description: 'Tracking relationship not found' })
  get(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
  ) {
    return this.contentPublishingConfigService.getForTrackedAgency(
      userId,
      agencyId,
    );
  }

  @Put()
  @ApiOperation({
    summary: 'Create or replace content publishing config for a tracked agency',
  })
  @ApiResponse({ status: 200, type: ContentPublishingConfigEntity })
  upsert(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
    @Body() dto: UpsertContentPublishingConfigDto,
  ) {
    return this.contentPublishingConfigService.upsertForTrackedAgency(
      userId,
      agencyId,
      dto,
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete content publishing config' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('agencyId') agencyId: string,
  ) {
    await this.contentPublishingConfigService.deleteForTrackedAgency(
      userId,
      agencyId,
    );
  }
}
