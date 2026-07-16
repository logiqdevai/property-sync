import type { CaptureEntry } from "../types/capture.types.js";
import type {
  PostmanBody,
  PostmanCollection,
  PostmanFolder,
  PostmanHeader,
  PostmanRequestItem,
  PostmanVariable,
} from "./postman.types.js";

export interface BuildCollectionOptions {
  name: string;
  description?: string;
  /** Resource types eligible for inclusion. Static assets are excluded by default. */
  resourceTypes?: string[];
}

const DEFAULT_RESOURCE_TYPES = ["xhr", "fetch", "document"];

export function buildPostmanCollection(entries: CaptureEntry[], options: BuildCollectionOptions): PostmanCollection {
  const apiEntries = entries.filter(
    (entry) =>
      entry.request.method !== "WEBSOCKET" &&
      (options.resourceTypes ?? DEFAULT_RESOURCE_TYPES).includes(entry.request.resourceType),
  );

  const latestBySignature = dedupeByLatest(apiEntries);
  const globals = extractGlobals(latestBySignature);
  const folders = groupIntoFolders(latestBySignature, globals);

  return {
    info: {
      name: options.name,
      description:
        options.description ?? `Auto-generated from ${apiEntries.length} captured request(s) — see the capturer's captures/session-*.json.`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: buildVariables(globals),
    item: folders,
  };
}

interface Globals {
  baseUrl: string;
  bearerToken: string | null;
  sessionCookieName: string | null;
  sessionCookieValue: string | null;
}

/** Keeps the chronologically latest entry per "METHOD origin+path" signature — freshest example, freshest auth. */
function dedupeByLatest(entries: CaptureEntry[]): CaptureEntry[] {
  const bySignature = new Map<string, CaptureEntry>();

  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const entry of sorted) {
    bySignature.set(`${entry.request.method} ${entry.request.path}`, entry);
  }

  return [...bySignature.values()];
}

function extractGlobals(entries: CaptureEntry[]): Globals {
  const originCounts = new Map<string, number>();
  let bearerToken: string | null = null;
  let sessionCookieName: string | null = null;
  let sessionCookieValue: string | null = null;

  for (const entry of entries) {
    const origin = safeOrigin(entry.request.url);
    if (origin) originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);

    if (!bearerToken) {
      const authHeader = findHeader(entry.request.headers, "authorization");
      const match = authHeader?.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) bearerToken = match[1];
    }

    if (!sessionCookieName) {
      const cookieEntries = Object.entries(entry.request.cookies);
      const sessionLike = cookieEntries.find(([key]) => /session/i.test(key)) ?? cookieEntries[0];
      if (sessionLike) {
        [sessionCookieName, sessionCookieValue] = sessionLike;
      }
    }
  }

  const baseUrl = [...originCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return { baseUrl, bearerToken, sessionCookieName, sessionCookieValue };
}

function buildVariables(globals: Globals): PostmanVariable[] {
  const variables: PostmanVariable[] = [{ key: "baseUrl", value: globals.baseUrl }];

  if (globals.bearerToken) {
    variables.push({ key: "bearerToken", value: globals.bearerToken });
  }
  if (globals.sessionCookieName) {
    variables.push({ key: globals.sessionCookieName, value: globals.sessionCookieValue ?? "" });
  }

  return variables;
}

function groupIntoFolders(entries: CaptureEntry[], globals: Globals): PostmanFolder[] {
  const folders = new Map<string, PostmanRequestItem[]>();

  const sorted = [...entries].sort((a, b) => a.request.path.localeCompare(b.request.path));
  for (const entry of sorted) {
    const folderName = folderNameFor(entry.request.path);
    const items = folders.get(folderName) ?? [];
    items.push(buildRequestItem(entry, globals));
    folders.set(folderName, items);
  }

  return [...folders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, item]) => ({ name, item }));
}

function folderNameFor(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "root";
  return segments[0] === "api" ? (segments[1] ?? "api") : (segments[0] ?? "root");
}

function buildRequestItem(entry: CaptureEntry, globals: Globals): PostmanRequestItem {
  const { request, response } = entry;
  const pathSegments = request.path.split("/").filter(Boolean);
  const query = Object.entries(request.query).flatMap(([key, value]) =>
    (Array.isArray(value) ? value : [value]).filter((v): v is string => v !== undefined).map((v) => ({ key, value: v })),
  );

  const rawUrl = `{{baseUrl}}${request.path}${query.length ? `?${query.map((q) => `${q.key}=${q.value}`).join("&")}` : ""}`;

  return {
    name: `${request.method} ${request.path}`,
    request: {
      method: request.method,
      header: buildRequestHeaders(request.headers, globals),
      body: buildRequestBody(request.body),
      url: { raw: rawUrl, host: ["{{baseUrl}}"], path: pathSegments, query: query.length ? query : undefined },
    },
    response: response ? [buildResponseExample(response)] : undefined,
  };
}

function buildRequestHeaders(headers: Record<string, string>, globals: Globals): PostmanHeader[] {
  return Object.entries(headers)
    .filter(([key]) => !key.startsWith(":") && key.toLowerCase() !== "content-length")
    .map(([key, value]) => ({ key, value: templatizeHeaderValue(key, value, globals), type: "text" as const }));
}

function templatizeHeaderValue(key: string, value: string, globals: Globals): string {
  const lowerKey = key.toLowerCase();

  if (lowerKey === "authorization" && globals.bearerToken) {
    return value.replace(globals.bearerToken, "{{bearerToken}}");
  }

  if (lowerKey === "cookie" && globals.sessionCookieName && globals.sessionCookieValue) {
    return value.replace(globals.sessionCookieValue, `{{${globals.sessionCookieName}}}`);
  }

  return value;
}

function buildRequestBody(body: CaptureEntry["request"]["body"]): PostmanBody | undefined {
  switch (body.encoding) {
    case "json":
      return { mode: "raw", raw: JSON.stringify(body.parsed, null, 2), options: { raw: { language: "json" } } };
    case "form-urlencoded":
      return {
        mode: "urlencoded",
        urlencoded: Object.entries(body.parsed as Record<string, string>).map(([key, value]) => ({ key, value })),
      };
    case "multipart":
      return {
        mode: "formdata",
        formdata: (body.parsed as Array<{ name: string; filename: string | null; value: string | null }>).map((field) =>
          field.filename !== null
            ? { key: field.name, type: "file" as const, src: field.filename }
            : { key: field.name, type: "text" as const, value: field.value ?? "" },
        ),
      };
    case "text":
      return { mode: "raw", raw: String(body.parsed), options: { raw: { language: "text" } } };
    case "none":
    default:
      return undefined;
  }
}

function buildResponseExample(response: CaptureEntry["response"]): NonNullable<PostmanRequestItem["response"]>[number] {
  if (!response) throw new Error("buildResponseExample called without a response");

  return {
    name: `${response.status} response`,
    status: String(response.status),
    code: response.status,
    header: Object.entries(response.headers).map(([key, value]) => ({ key, value, type: "text" })),
    body: response.truncated ? `[truncated, ${response.size} bytes]` : stringifyResponseBody(response.body, response.format),
    _postman_previewlanguage: response.format === "binary" || response.format === "unknown" ? "text" : response.format,
  };
}

function stringifyResponseBody(body: unknown, format: string): string {
  if (body === null || body === undefined) return "";
  if (format === "json") return JSON.stringify(body, null, 2);
  return String(body);
}

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
