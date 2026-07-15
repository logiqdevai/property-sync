import {
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { OpenAiWebhooksService } from './openai-webhooks.service';

@ApiExcludeController()
@Controller('webhooks/openai')
export class OpenAiWebhooksController {
  constructor(private readonly openAiWebhooksService: OpenAiWebhooksService) {}

  @Post(':userIntegrationId')
  @HttpCode(204)
  async handleIntegrationWebhook(
    @Param('userIntegrationId') userIntegrationId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const rawBody = req.rawBody?.toString('utf-8') ?? '';
    await this.openAiWebhooksService.handleWebhook(
      rawBody,
      headers,
      userIntegrationId,
    );
  }
}
