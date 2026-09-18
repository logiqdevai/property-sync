import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { Prisma } from 'generated/prisma';
import {
  ACTIVITY_COLLECTOR_CLS_KEY,
  MAX_SNAPSHOT_ENTITIES,
} from './constants/activity-log.constants';
import { ActivityLogQueryType } from './dto/activity-log-query.schema';
import { getEntityDefinition } from './entities/entity-registry';
import {
  ActivityLogEntry,
  ChangeInput,
  ChangeRow,
} from './interfaces/activity-log.interface';
import { computeChanges, inferOperation } from './utils/diff.util';
import { sanitizeForLog } from './utils/redact.util';

const ACTOR_EMAIL_TTL_MS = 5 * 60 * 1000;

interface SnapshotDelegate {
  findMany(args: {
    where: { id: { in: string[] } };
    omit?: Record<string, true>;
  }): Promise<Array<Record<string, unknown> & { id: string }>>;
}

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);
  private readonly actorEmailCache = new Map<
    string,
    { email: string | null; expires: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ---------------------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------------------

  /**
   * Escape hatch for operations the interceptor's generic id-based snapshotting can't model
   * (merge/split, dedupe, multi-entity bulk work). Buffers a before/after pair on the current
   * request; the interceptor flushes it into the request's activity log entry. A no-op outside
   * an HTTP request (cron, BullMQ processors) -- returns false in that case.
   */
  recordChange(
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ): boolean {
    if (!this.cls.isActive()) return false;
    const collector = this.cls.get<ChangeInput[] | undefined>(
      ACTIVITY_COLLECTOR_CLS_KEY,
    );
    if (!collector) return false;
    collector.push({
      entity_type: entityType,
      entity_id: entityId,
      before,
      after,
    });
    return true;
  }

  /** Changes buffered via recordChange() during the current request. */
  takeCollectedChanges(): ChangeInput[] {
    if (!this.cls.isActive()) return [];
    return this.cls.get<ChangeInput[] | undefined>(ACTIVITY_COLLECTOR_CLS_KEY) ?? [];
  }

  startCollecting(): void {
    if (this.cls.isActive()) this.cls.set(ACTIVITY_COLLECTOR_CLS_KEY, []);
  }

  /** Reads redaction-safe snapshots (secrets `omit`-ed at query time) keyed by entity id. */
  async loadSnapshots(
    entity: string,
    ids: string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const definition = getEntityDefinition(entity);
    const result = new Map<string, Record<string, unknown>>();
    if (!definition || ids.length === 0) return result;

    const delegate = (this.prisma as unknown as Record<string, SnapshotDelegate>)[
      definition.delegate
    ];
    const rows = await delegate.findMany({
      where: { id: { in: ids.slice(0, MAX_SNAPSHOT_ENTITIES) } },
      ...(definition.omit && { omit: definition.omit }),
    });
    for (const row of rows) result.set(row.id, row);
    return result;
  }

  /**
   * Diffs the raw snapshots (so secrets that changed are still flagged), then redacts and
   * bounds what gets stored.
   */
  buildChangeRows(inputs: ChangeInput[]): ChangeRow[] {
    const rows: ChangeRow[] = [];
    for (const input of inputs) {
      if (input.before == null && input.after == null) continue;
      const changes = computeChanges(input.before, input.after);
      rows.push({
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        operation: inferOperation(input.before, input.after, changes),
        before: sanitizeForLog(input.before),
        after: sanitizeForLog(input.after),
        changes: sanitizeForLog(changes) as ChangeRow['changes'],
      });
    }
    return rows;
  }

  /** Persists one entry. Never throws: activity logging must not break the user's request. */
  async record(entry: ActivityLogEntry): Promise<void> {
    try {
      const actorEmail =
        entry.actor_email ??
        (entry.actor_id ? await this.resolveActorEmail(entry.actor_id) : null);

      const { changes, request_body, request_query, ...columns } = entry;
      await this.prisma.activityLog.create({
        data: {
          ...columns,
          actor_email: actorEmail,
          request_body: toJson(request_body),
          request_query: toJson(request_query),
          ...(changes.length > 0 && {
            changes: {
              createMany: {
                data: changes.map((change) => ({
                  entity_type: change.entity_type,
                  entity_id: change.entity_id,
                  operation: change.operation,
                  before: toJson(change.before),
                  after: toJson(change.after),
                  changes: toJson(change.changes) ?? [],
                })),
              },
            },
          }),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record activity log (action=${entry.action} path=${entry.path}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async resolveActorEmail(actorId: string): Promise<string | null> {
    const cached = this.actorEmailCache.get(actorId);
    if (cached && cached.expires > Date.now()) return cached.email;

    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { email: true },
    });
    const email = user?.email ?? null;
    this.actorEmailCache.set(actorId, {
      email,
      expires: Date.now() + ACTOR_EMAIL_TTL_MS,
    });
    return email;
  }

  // ---------------------------------------------------------------------------------------
  // Admin queries
  // ---------------------------------------------------------------------------------------

  async findAll(query: ActivityLogQueryType) {
    const where = this.buildWhere(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        // Bodies/queries and snapshots can be large; they're only served by findOne().
        omit: { request_body: true, request_query: true },
        include: { _count: { select: { changes: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const log = await this.prisma.activityLog.findUnique({
      where: { id },
      include: {
        changes: {
          orderBy: { created_at: 'asc' },
          take: MAX_SNAPSHOT_ENTITIES,
        },
      },
    });
    return log;
  }

  /** Distinct values for the admin page's filter dropdowns. */
  async getFacets(): Promise<{
    categories: string[];
    actions: string[];
    entity_types: string[];
  }> {
    const [categories, actions, entityTypes] = await Promise.all([
      this.prisma.activityLog.groupBy({ by: ['category'], orderBy: { category: 'asc' } }),
      this.prisma.activityLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
      this.prisma.activityLogChange.groupBy({
        by: ['entity_type'],
        orderBy: { entity_type: 'asc' },
      }),
    ]);
    return {
      categories: categories.map((row) => row.category),
      actions: actions.map((row) => row.action),
      entity_types: entityTypes.map((row) => row.entity_type),
    };
  }

  private buildWhere(query: ActivityLogQueryType): Prisma.ActivityLogWhereInput {
    return {
      ...(query.user_id && {
        OR: [{ actor_id: query.user_id }, { effective_user_id: query.user_id }],
      }),
      ...(query.actor_id && { actor_id: query.actor_id }),
      ...(query.action && { action: query.action }),
      ...(query.category && { category: query.category }),
      ...(query.outcome && { outcome: query.outcome }),
      ...((query.entity_type || query.entity_id) && {
        changes: {
          some: {
            ...(query.entity_type && { entity_type: query.entity_type }),
            ...(query.entity_id && { entity_id: query.entity_id }),
          },
        },
      }),
      ...(query.date_from || query.date_to
        ? {
            created_at: {
              ...(query.date_from && { gte: query.date_from }),
              ...(query.date_to && { lte: query.date_to }),
            },
          }
        : {}),
    };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === null || value === undefined
    ? undefined
    : (value as Prisma.InputJsonValue);
}
