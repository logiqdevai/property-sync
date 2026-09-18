import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import {
  AUDITED_METADATA_KEY,
  SKIP_AUDIT_METADATA_KEY,
} from '../constants/activity-log.constants';
import type { PrismaService } from '@/core/databases/prisma/prisma.service';
import type { AuditEntityType } from '../entities/entity-registry';

export interface AuditContext {
  prisma: PrismaService;
}

/**
 * Where to find the affected entity ids. `param`/`body`/`query` read the request. A function may
 * be async and query Prisma -- used for entities addressed by a composite key rather than an id
 * (e.g. a user's tracked agency). Functions run before the handler *and again after it*, so rows
 * the handler created are picked up too.
 */
export type AuditIdSource =
  | { param: string }
  | { body: string }
  | { query: string }
  | ((req: Request, ctx: AuditContext) => unknown | Promise<unknown>);

/** Where to find affected ids in the handler's return value (creates, bulk results). */
export type AuditResultIdSource =
  | { path: string }
  | ((result: unknown) => unknown);

export interface AuditedOptions {
  /** Dot-string action name, e.g. `user_property.update`. */
  action: string;
  /** Defaults to the first segment of `action`. */
  category?: string;
  /** Registry key of the entity to snapshot before/after. Omit for actions with no entity. */
  entity?: AuditEntityType;
  /** Ids of the affected entities known before the handler runs. */
  ids?: AuditIdSource;
  /** Ids read from the response (default `{ path: 'id' }` when `entity` is set). */
  resultIds?: AuditResultIdSource;
}

/**
 * Enriches the automatic activity log entry of a route with a stable action name and
 * before/after entity snapshots. Every mutating route must carry either this or @SkipAudit
 * (enforced by activity-log-coverage.spec.ts).
 */
export const Audited = (options: AuditedOptions): MethodDecorator =>
  SetMetadata(AUDITED_METADATA_KEY, options);

/** Explicit opt-out for routes that must not be logged (webhooks, non-UI actors). */
export const SkipAudit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_AUDIT_METADATA_KEY, true);
