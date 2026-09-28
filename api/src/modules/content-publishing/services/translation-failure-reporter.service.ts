import { Injectable, Logger } from '@nestjs/common';
import {
  ActivityOutcome,
  JobStatus,
  NotificationSeverity,
  NotificationType,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AzureTranslateErrorCode } from '@/integrations/azure-translate/exceptions/azure-translate.exception';
import { ActivityLogsService } from '@/modules/activity-logs/activity-logs.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

export const TRANSLATION_JOB_QUEUE = 'content-translation';

// Translation runs once per property x field x language, so a bad key or an exhausted quota
// fails thousands of calls in a row. Persist (job log + activity log + notification) at most
// once per user+code per window; everything in between is only counted and logged.
const REPORT_COOLDOWN_MS = 30 * 60 * 1000;

const TITLES: Record<AzureTranslateErrorCode, string> = {
  AZURE_TRANSLATE_NOT_CONFIGURED: 'Azure Translate is not configured',
  AZURE_TRANSLATE_BAD_REQUEST: 'Azure Translate rejected a request',
  AZURE_TRANSLATE_UNAUTHORIZED: 'Azure Translate key is invalid',
  AZURE_TRANSLATE_FORBIDDEN: 'Azure Translate refused the request (quota?)',
  AZURE_TRANSLATE_NOT_FOUND: 'Azure Translate resource not found',
  AZURE_TRANSLATE_RATE_LIMITED: 'Azure Translate rate limit exceeded',
  AZURE_TRANSLATE_SERVER_ERROR: 'Azure Translate is having server errors',
  AZURE_TRANSLATE_NETWORK_ERROR: 'Azure Translate is unreachable',
  AZURE_TRANSLATE_TIMEOUT: 'Azure Translate timed out',
  AZURE_TRANSLATE_INVALID_RESPONSE: 'Azure Translate returned an invalid response',
  AZURE_TRANSLATE_API_ERROR: 'Azure Translate API error',
};

const CRITICAL_CODES = new Set<AzureTranslateErrorCode>([
  'AZURE_TRANSLATE_NOT_CONFIGURED',
  'AZURE_TRANSLATE_UNAUTHORIZED',
  'AZURE_TRANSLATE_FORBIDDEN',
]);

export interface TranslationFailure {
  userId: string;
  code: AzureTranslateErrorCode;
  message: string;
  httpStatus?: number;
  sourceLanguage?: string;
  targetLanguage?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class TranslationFailureReporterService {
  private readonly logger = new Logger(TranslationFailureReporterService.name);
  private readonly reported = new Map<
    string,
    { at: number; suppressed: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  /** Never throws: reporting a failure must not change the translation flow. */
  async report(failure: TranslationFailure): Promise<void> {
    try {
      const key = `${failure.userId}:${failure.code}`;
      const now = Date.now();
      const previous = this.reported.get(key);

      if (previous && now - previous.at < REPORT_COOLDOWN_MS) {
        previous.suppressed += 1;
        return;
      }
      const suppressed = previous?.suppressed ?? 0;
      this.reported.set(key, { at: now, suppressed: 0 });

      const title = TITLES[failure.code];
      const suffix =
        suppressed > 0 ? ` (${suppressed} similar failures since the last report)` : '';
      const message = `${failure.message}${suffix}`;

      const jobLog = await this.prisma.jobLog.create({
        data: {
          queue_name: TRANSLATION_JOB_QUEUE,
          job_name: 'azure-translate',
          status: JobStatus.FAILED,
          started_at: new Date(now),
          finished_at: new Date(now),
          duration_ms: 0,
          error_message: `${failure.code}: ${message}`,
          payload: {
            user_id: failure.userId,
            code: failure.code,
            http_status: failure.httpStatus ?? null,
            source_language: failure.sourceLanguage ?? null,
            target_language: failure.targetLanguage ?? null,
            suppressed_since_last_report: suppressed,
            details: (failure.details ?? null) as never,
          },
        },
      });

      await this.activityLogsService.record({
        request_id: null,
        action: 'translation.failed',
        category: 'translation',
        method: 'SYSTEM',
        route: 'azure-translate/translate',
        path: 'azure-translate/translate',
        status_code: failure.httpStatus ?? null,
        outcome: ActivityOutcome.FAILURE,
        error_message: `${failure.code}: ${message}`,
        duration_ms: 0,
        actor_id: null,
        actor_email: null,
        actor_role: null,
        effective_user_id: failure.userId,
        is_impersonated: false,
        ip: null,
        user_agent: null,
        client_route: null,
        client_session_id: null,
        request_body: {
          code: failure.code,
          source_language: failure.sourceLanguage ?? null,
          target_language: failure.targetLanguage ?? null,
        },
        request_query: null,
        job_log_id: jobLog.id,
        affected_count: 0,
        snapshots_truncated: false,
        changes: [],
      });

      this.notificationsService.create({
        type: NotificationType.TRANSLATION_FAILURE,
        severity: CRITICAL_CODES.has(failure.code)
          ? NotificationSeverity.CRITICAL
          : NotificationSeverity.WARNING,
        title,
        message: `User ${failure.userId}: ${message}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to report translation failure (${failure.code}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
