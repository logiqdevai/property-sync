export const AUDITED_METADATA_KEY = 'activity-log:audited';
export const SKIP_AUDIT_METADATA_KEY = 'activity-log:skip';

/** ClsService key holding the per-request collector used by ActivityLogsService.recordChange(). */
export const ACTIVITY_COLLECTOR_CLS_KEY = 'activity-log:collector';

export const ACTIVITY_HEADERS = {
  REQUEST_ID: 'x-request-id',
  CLIENT_ROUTE: 'x-client-route',
  SESSION_ID: 'x-session-id',
} as const;

/** HTTP methods that never change data; only logged when the handler carries @Audited. */
export const READ_ONLY_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
]);

/** Max entities snapshotted (before + after) per request; beyond this only the count is kept. */
export const MAX_SNAPSHOT_ENTITIES = 500;

/** Any single string longer than this is cut and marked. */
export const MAX_STRING_LENGTH = 10_000;

/** A whole JSON document (body/snapshot/changes) larger than this is replaced by a preview. */
export const MAX_DOCUMENT_BYTES = 256 * 1024;

export const MAX_HEADER_VALUE_LENGTH = 255;
export const MAX_ERROR_MESSAGE_LENGTH = 2_000;
