import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramConfig {
  private readonly logger = new Logger(TelegramConfig.name);
  private readonly botKey: string | null;
  private readonly chatId: string | null;
  private readonly apiBaseUrl: string | null;

  constructor(private readonly configService: ConfigService) {
    this.botKey = this.configService.get<string>('TELEGRAM_BOT_KEY') ?? null;
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID') ?? null;

    if (!this.botKey || !this.chatId) {
      this.logger.error('TELEGRAM_BOT_KEY or TELEGRAM_CHAT_ID is not configured');
      this.apiBaseUrl = null;
      return;
    }

    this.apiBaseUrl = `https://api.telegram.org/bot${this.botKey}`;
    this.logger.debug('Telegram initialized');
  }

  isConfigured(): boolean {
    return Boolean(this.apiBaseUrl && this.chatId);
  }

  getChatId(): string {
    if (!this.chatId) {
      throw new Error('Telegram chat id is not configured');
    }

    return this.chatId;
  }

  getMethodUrl(method: string): string {
    if (!this.apiBaseUrl) {
      throw new Error('Telegram bot key is not configured');
    }

    return `${this.apiBaseUrl}/${method}`;
  }
}
