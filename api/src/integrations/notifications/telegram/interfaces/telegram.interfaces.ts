import { NotificationSeverity, NotificationType } from 'generated/prisma';

export interface TelegramSendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_notification?: boolean;
}

export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface TelegramNotificationPayload {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  source_agency_id?: string | null;
  scraper_id?: string | null;
  crawl_run_id?: string | null;
}
