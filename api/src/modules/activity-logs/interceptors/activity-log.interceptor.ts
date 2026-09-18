import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { ActivityOutcome } from 'generated/prisma';
import { ActivityLogsService } from '../activity-logs.service';
import {
  ACTIVITY_HEADERS,
  AUDITED_METADATA_KEY,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_HEADER_VALUE_LENGTH,
  MAX_SNAPSHOT_ENTITIES,
  READ_ONLY_METHODS,
  SKIP_AUDIT_METADATA_KEY,
} from '../constants/activity-log.constants';
import {
  AuditContext,
  AuditIdSource,
  AuditResultIdSource,
  AuditedOptions,
} from '../decorators/audited.decorator';
import {
  ActivityLogEntry,
  ChangeInput,
} from '../interfaces/activity-log.interface';
import { sanitizeForLog } from '../utils/redact.util';

interface AuthenticatedUser {
  id?: string;
  role?: string;
  /** Present on impersonation tokens: the admin who is really acting. */
  actor_id?: string;
}

/** Minimal shape of a multer file; avoids depending on Express.Multer type augmentation. */
interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
}

interface Snapshots {
  ids: string[];
  byId: Map<string, Record<string, unknown>>;
  truncated: boolean;
}

/**
 * Records every data-changing request (all non-GET routes, plus any GET marked @Audited) as an
 * ActivityLog row with redacted request data and, for @Audited routes with an entity, before/
 * after snapshots. Guards run before interceptors, so req.user is already populated here.
 *
 * Logging is best-effort by design: nothing in this class may fail or delay the user's request
 * beyond the two snapshot reads, and the final insert is fire-and-forget.
 */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly activityLogs: ActivityLogsService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const handler = context.getHandler();
    const controller = context.getClass();
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_METADATA_KEY, [
        handler,
        controller,
      ])
    ) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const meta = this.reflector.get<AuditedOptions | undefined>(
      AUDITED_METADATA_KEY,
      handler,
    );
    if (!meta && READ_ONLY_METHODS.has(req.method.toUpperCase())) {
      return next.handle();
    }

    const startedAt = Date.now();
    const successStatus =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, handler) ??
      (req.method.toUpperCase() === 'POST' ? 201 : 200);
    const descriptor = {
      meta,
      action: meta?.action ?? defaultAction(controller.name, handler.name),
    };

    this.activityLogs.startCollecting();

    return from(this.safely(() => this.loadBefore(meta, req))).pipe(
      mergeMap((before) =>
        next.handle().pipe(
          mergeMap(async (result) => {
            await this.safely(() =>
              this.finish({
                req,
                descriptor,
                before,
                result,
                startedAt,
                statusCode: successStatus,
                error: null,
              }),
            );
            return result;
          }),
          catchError((error: unknown) => {
            void this.safely(() =>
              this.finish({
                req,
                descriptor,
                before,
                result: undefined,
                startedAt,
                statusCode:
                  error instanceof HttpException ? error.getStatus() : 500,
                error,
              }),
            );
            return throwError(() => error);
          }),
        ),
      ),
    );
  }

  private async loadBefore(
    meta: AuditedOptions | undefined,
    req: Request,
  ): Promise<Snapshots | null> {
    if (!meta?.entity || !meta.ids) return null;
    const allIds = await extractIds(meta.ids, req, { prisma: this.prisma });
    return this.snapshot(meta.entity, allIds);
  }

  private async snapshot(entity: string, allIds: string[]): Promise<Snapshots> {
    const truncated = allIds.length > MAX_SNAPSHOT_ENTITIES;
    const ids = allIds.slice(0, MAX_SNAPSHOT_ENTITIES);
    const byId = await this.activityLogs.loadSnapshots(entity, ids);
    return { ids, byId, truncated };
  }

  private async finish(args: {
    req: Request;
    descriptor: { meta: AuditedOptions | undefined; action: string };
    before: Snapshots | null;
    result: unknown;
    startedAt: number;
    statusCode: number;
    error: unknown;
  }): Promise<void> {
    const { req, descriptor, before, result, startedAt, statusCode, error } = args;
    const { meta, action } = descriptor;
    const failed = error !== null;

    const inputs: ChangeInput[] = [];
    let affectedCount = before?.ids.length ?? 0;
    let truncated = before?.truncated ?? false;

    if (!failed && meta?.entity) {
      const resultIds = extractResultIds(
        meta.resultIds ?? { path: 'id' },
        result,
      );
      // Function sources are re-run: rows the handler created are now resolvable.
      const rerunIds =
        typeof meta.ids === 'function'
          ? await extractIds(meta.ids, req, { prisma: this.prisma })
          : [];
      const ids = unique([...(before?.ids ?? []), ...rerunIds, ...resultIds]);
      affectedCount = Math.max(affectedCount, ids.length);
      const after = await this.snapshot(meta.entity, ids);
      truncated = truncated || after.truncated;

      for (const id of after.ids) {
        inputs.push({
          entity_type: meta.entity,
          entity_id: id,
          before: before?.byId.get(id) ?? null,
          after: after.byId.get(id) ?? null,
        });
      }
    }

    if (!failed) {
      const collected = this.activityLogs.takeCollectedChanges();
      if (collected.length > MAX_SNAPSHOT_ENTITIES) truncated = true;
      inputs.push(...collected.slice(0, MAX_SNAPSHOT_ENTITIES));
      affectedCount = Math.max(affectedCount, inputs.length);
    }

    const rows = this.activityLogs.buildChangeRows(inputs);
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    const loginUser = readLoginUser(result);
    const actorId = user?.actor_id ?? user?.id ?? loginUser?.id ?? null;

    const entry: ActivityLogEntry = {
      request_id:
        header(req, ACTIVITY_HEADERS.REQUEST_ID) ?? randomUUID(),
      action,
      category: meta?.category ?? action.split('.')[0],
      method: req.method.toUpperCase(),
      route: (req.route as { path?: string } | undefined)?.path ?? req.path,
      path: req.originalUrl.split('?')[0],
      status_code: statusCode,
      outcome: failed ? ActivityOutcome.FAILURE : ActivityOutcome.SUCCESS,
      error_message: failed ? errorMessage(error) : null,
      duration_ms: Date.now() - startedAt,
      actor_id: actorId,
      // Authenticated actors are resolved by id in ActivityLogsService.record().
      actor_email: user ? null : (loginUser?.email ?? loginEmailFromBody(req)),
      actor_role: user?.role ?? loginUser?.role ?? null,
      effective_user_id: user?.id ?? loginUser?.id ?? null,
      is_impersonated: Boolean(user?.actor_id && user.actor_id !== user.id),
      ip: clientIp(req),
      user_agent: header(req, 'user-agent'),
      client_route: header(req, ACTIVITY_HEADERS.CLIENT_ROUTE),
      client_session_id: header(req, ACTIVITY_HEADERS.SESSION_ID),
      request_body: sanitizeForLog(describeBody(req)),
      request_query: sanitizeForLog(req.query),
      job_log_id: readJobLogId(result),
      affected_count: affectedCount,
      snapshots_truncated: truncated,
      changes: rows,
    };

    // Fire-and-forget: record() swallows its own errors.
    void this.activityLogs.record(entry);
  }

  private async safely<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(
        `Activity log capture failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}

// -------------------------------------------------------------------------------------------
// Helpers (pure)
// -------------------------------------------------------------------------------------------

/** `UserPropertiesController` + `pushToCms` -> `user_properties.push_to_cms`. */
export function defaultAction(controllerName: string, handlerName: string): string {
  return `${snakeCase(controllerName.replace(/Controller$/, ''))}.${snakeCase(handlerName)}`;
}

function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export async function extractIds(
  source: AuditIdSource,
  req: Request,
  ctx: AuditContext,
): Promise<string[]> {
  let raw: unknown;
  if (typeof source === 'function') raw = await source(req, ctx);
  else if ('param' in source) raw = req.params?.[source.param];
  else if ('body' in source) raw = getByPath(req.body, source.body);
  else raw = getByPath(req.query, source.query);
  return toIdList(raw);
}

export function extractResultIds(
  source: AuditResultIdSource,
  result: unknown,
): string[] {
  const raw = typeof source === 'function' ? source(result) : getByPath(result, source.path);
  return toIdList(raw);
}

/** Accepts a scalar id, an array of ids, or an array of `{ id }` objects. */
function toIdList(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw : [raw];
  return unique(
    items
      .map((item) =>
        typeof item === 'string'
          ? item
          : item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
            ? (item as { id: string }).id
            : null,
      )
      .filter((id): id is string => Boolean(id)),
  );
}

function getByPath(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[key]
          : undefined,
      source,
    );
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function header(req: Request, name: string): string | null {
  const value = req.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first.slice(0, MAX_HEADER_VALUE_LENGTH) : null;
}

function clientIp(req: Request): string | null {
  const forwarded = header(req, 'x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || req.ip || null;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function describeBody(req: Request): unknown {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) return req.body;

  const upload = req as Request & { file?: UploadedFile; files?: unknown };
  const files = [
    ...(upload.file ? [upload.file] : []),
    ...(Array.isArray(upload.files) ? (upload.files as UploadedFile[]) : []),
  ].map((file) => ({
    name: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  }));
  return { _multipart: true, fields: req.body, files };
}

/** Successful login/registration responses carry the (unauthenticated) caller's identity. */
function readLoginUser(
  result: unknown,
): { id: string; email: string | null; role: string | null } | null {
  const user = (result as { user?: Record<string, unknown> } | undefined)?.user;
  if (!user || typeof user.id !== 'string') return null;
  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : null,
    role: typeof user.role === 'string' ? user.role : null,
  };
}

/** Lets failed logins be attributed to the attempted email even though no user is resolved. */
function loginEmailFromBody(req: Request): string | null {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && req.path.includes('/auth/')
    ? email.slice(0, MAX_HEADER_VALUE_LENGTH)
    : null;
}

function readJobLogId(result: unknown): string | null {
  const id = (result as { job_log_id?: unknown } | undefined)?.job_log_id;
  return typeof id === 'string' ? id : null;
}
