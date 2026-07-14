export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

import { NotificationSeverity, NotificationType } from 'generated/prisma';

export interface CreateNotificationInput {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  source_agency_id?: string;
  scraper_id?: string;
  crawl_run_id?: string;
}
