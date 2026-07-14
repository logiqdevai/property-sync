import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ComputerUseStepResult } from '../interfaces/computer-use.interface';

@Injectable()
export class ComputerUseClientService {
  constructor(private readonly configService: ConfigService) {}

  private getApiKey(): string {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    return apiKey;
  }

  createClient(): Anthropic {
    return new Anthropic({ apiKey: this.getApiKey() });
  }

  async sendStep(
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    model: string,
  ): Promise<ComputerUseStepResult> {
    const client = this.createClient();

    // Reference CLI sets thinking: { type: 'adaptive' }, but that isn't a value the
    // Messages API's ThinkingConfigParam accepts (only 'enabled' with a budget_tokens,
    // or 'disabled') — omitted rather than sending a request the API would reject.
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');

    return {
      rawText: textBlock && textBlock.type === 'text' ? textBlock.text : '',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}
