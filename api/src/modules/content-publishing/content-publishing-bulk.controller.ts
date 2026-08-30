import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { BulkSetAiBatchDto } from './dto/bulk-set-ai-batch.dto';
import { ContentPublishingConfigService } from './services/content-publishing-config.service';

@ApiTags('Content Publishing')
@ApiBearerAuth()
@Controller('content-publishing')
@UseGuards(JwtGuard)
export class ContentPublishingBulkController {
  constructor(
    private readonly contentPublishingConfigService: ContentPublishingConfigService,
  ) {}

  @Patch('bulk-ai-batch')
  @ApiOperation({
    summary:
      'Set the OpenAI Batch API default for title generation across every tracked agency for this user',
  })
  bulkSetAiBatch(
    @CurrentUser('id') userId: string,
    @Body() dto: BulkSetAiBatchDto,
  ) {
    return this.contentPublishingConfigService.bulkSetUseAiBatch(
      userId,
      dto.use_ai_batch,
    );
  }
}
