import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ComputerUseStepResult } from '../interfaces/computer-use.interface';

@Injectable()
export class ComputerUseClientService {
  createClient(apiKey: string): Anthropic {
    return new Anthropic({ apiKey });
  }

  async sendStep(
    apiKey: string,
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    model: string,
  ): Promise<ComputerUseStepResult> {
    const client = this.createClient(apiKey);

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
