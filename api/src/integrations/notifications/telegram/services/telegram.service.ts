import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NotificationSeverity } from 'generated/prisma';
import { TelegramConfig } from '../config/telegram.config';
import {
  TelegramApiResponse,
  TelegramNotificationPayload,
  TelegramSendMessagePayload,
} from '../interfaces/telegram.interfaces';

@Injectable()
export class TelegramService {
  constructor(private readonly telegramConfig: TelegramConfig) {}

  async sendNotification(notification: TelegramNotificationPayload): Promise<void> {
    if (!this.telegramConfig.isConfigured()) {
      return;
    }

    await this.sendMessage({
      chat_id: this.telegramConfig.getChatId(),
      text: this.formatNotification(notification),
      parse_mode: 'HTML',
      disable_notification: notification.severity === NotificationSeverity.INFO,
    });
  }

  async sendTestMessage(text: string): Promise<{ sent: true }> {
    if (!this.telegramConfig.isConfigured()) {
      throw new ServiceUnavailableException(
        'Telegram is not configured. Set TELEGRAM_BOT_KEY and TELEGRAM_CHAT_ID.',
      );
    }

    await this.sendMessage({
      chat_id: this.telegramConfig.getChatId(),
      text,
    });

    return { sent: true };
  }

  async sendMessage(payload: TelegramSendMessagePayload): Promise<void> {
    if (!this.telegramConfig.isConfigured()) {
      return;
    }

    const response = await fetch(this.telegramConfig.getMethodUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as TelegramApiResponse;

    if (!response.ok || !body.ok) {
      throw new BadGatewayException(
        body.description || `Telegram sendMessage failed with status ${response.status}`,
      );
    }
  }

  private formatNotification(notification: TelegramNotificationPayload): string {
    const lines = [
      `<b>${this.escapeHtml(notification.severity)}</b> · ${this.escapeHtml(notification.type)}`,
      `<b>${this.escapeHtml(notification.title)}</b>`,
      this.escapeHtml(notification.message),
    ];

    if (notification.source_agency_id) {
      lines.push(`Agency: <code>${this.escapeHtml(notification.source_agency_id)}</code>`);
    }

    if (notification.scraper_id) {
      lines.push(`Scraper: <code>${this.escapeHtml(notification.scraper_id)}</code>`);
    }

    if (notification.crawl_run_id) {
      lines.push(`Crawl run: <code>${this.escapeHtml(notification.crawl_run_id)}</code>`);
    }

    return lines.join('\n');
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
