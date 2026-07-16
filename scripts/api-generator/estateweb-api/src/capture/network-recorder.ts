import type { BrowserContext, Request, WebSocket } from "playwright";
import type { CaptureConfig } from "../types/config.types.js";
import type { CaptureEntry, RedirectHop } from "../types/capture.types.js";
import { generateId } from "../utils/id-generator.js";
import { parseCookieHeader, parseQueryParams } from "../utils/url-utils.js";
import { shouldCaptureResourceType } from "./resource-filter.js";
import { shouldIgnoreRequest } from "./ignore-filter.js";
import { parseRequestBody } from "./body-parser.js";
import { parseResponseBody } from "./response-parser.js";
import { logger } from "../utils/logger.js";

interface PendingEntry {
  id: string;
  sequence: number;
  startedAt: number;
  startedAtIso: string;
}

/**
 * Attaches to a BrowserContext and records every request/response pair (plus
 * failures and websocket frames) into an ordered, correlated list of entries.
 */
export class NetworkRecorder {
  private readonly config: CaptureConfig;
  private readonly entries: CaptureEntry[] = [];
  private readonly pending = new Map<Request, PendingEntry>();
  private readonly seenSignatures = new Map<string, number>();
  private sequence = 0;

  constructor(config: CaptureConfig) {
    this.config = config;
  }

  attach(context: BrowserContext): void {
    context.on("request", (request) => this.onRequest(request));
    context.on("requestfinished", (request) => {
      void this.onRequestFinished(request);
    });
    context.on("requestfailed", (request) => {
      void this.onRequestFailed(request);
    });
    context.on("page", (page) => {
      page.on("websocket", (ws) => this.onWebSocket(ws));
    });
  }

  getEntries(): CaptureEntry[] {
    return [...this.entries].sort((a, b) => a.sequence - b.sequence);
  }

  private onRequest(request: Request): void {
    if (!this.shouldCapture(request)) return;

    this.pending.set(request, {
      id: generateId(),
      sequence: this.sequence++,
      startedAt: Date.now(),
      startedAtIso: new Date().toISOString(),
    });
  }

  private async onRequestFinished(request: Request): Promise<void> {
    const pendingEntry = this.pending.get(request);
    if (!pendingEntry) return;
    this.pending.delete(request);

    try {
      const response = await request.response();
      const entry = await this.buildEntry(request, pendingEntry, response, false, null);
      this.entries.push(entry);
    } catch (error) {
      logger.warn(`Failed to finalize capture for ${request.url()}: ${(error as Error).message}`);
    }
  }

  private async onRequestFailed(request: Request): Promise<void> {
    const pendingEntry = this.pending.get(request);
    if (!pendingEntry) return;
    this.pending.delete(request);

    const errorText = request.failure()?.errorText ?? "Unknown error";
    const entry = await this.buildEntry(request, pendingEntry, null, true, errorText);
    this.entries.push(entry);
  }

  private onWebSocket(ws: WebSocket): void {
    if (!this.config.captureWebSockets) return;

    const id = generateId();
    const sequence = this.sequence++;
    const startedAt = Date.now();
    const startedAtIso = new Date().toISOString();
    const frames: Array<{ direction: "sent" | "received"; payload: string; timestamp: string }> = [];

    logger.info(`WebSocket opened: ${ws.url()}`);

    ws.on("framesent", (frame) => {
      frames.push({ direction: "sent", payload: framePayloadToString(frame.payload), timestamp: new Date().toISOString() });
    });
    ws.on("framereceived", (frame) => {
      frames.push({ direction: "received", payload: framePayloadToString(frame.payload), timestamp: new Date().toISOString() });
    });

    const finalize = (failed: boolean, errorText: string | null): void => {
      this.entries.push({
        id,
        sequence,
        timestamp: startedAtIso,
        duration: Date.now() - startedAt,
        duplicate: false,
        redirectChain: [],
        request: {
          method: "WEBSOCKET",
          url: ws.url(),
          path: safePath(ws.url()),
          query: {},
          headers: {},
          cookies: {},
          body: { raw: null, parsed: frames, encoding: "none" },
          resourceType: "websocket",
          initiator: null,
        },
        response: null,
        failed,
        error: failed ? { errorText: errorText ?? "Unknown error" } : null,
      });
    };

    ws.once("close", () => finalize(false, null));
    ws.once("socketerror", (errorText) => finalize(true, errorText));
  }

  private shouldCapture(request: Request): boolean {
    if (!shouldCaptureResourceType(request.resourceType(), this.config)) return false;
    if (shouldIgnoreRequest(request.url(), this.config.ignore)) return false;
    return true;
  }

  private async buildEntry(
    request: Request,
    pendingEntry: PendingEntry,
    response: Awaited<ReturnType<Request["response"]>>,
    failed: boolean,
    errorText: string | null,
  ): Promise<CaptureEntry> {
    const url = safeUrl(request.url());
    const signature = `${request.method()} ${url ? url.origin + url.pathname : request.url()}`;
    const seenCount = this.seenSignatures.get(signature) ?? 0;
    this.seenSignatures.set(signature, seenCount + 1);

    const headers = await safeHeaders(request);
    const redirectChain = await buildRedirectChain(request);
    const capturedResponse = response ? await parseResponseBody(response, this.config.maxBodySizeBytes) : null;

    return {
      id: pendingEntry.id,
      sequence: pendingEntry.sequence,
      timestamp: pendingEntry.startedAtIso,
      duration: Date.now() - pendingEntry.startedAt,
      duplicate: seenCount > 0,
      redirectChain,
      request: {
        method: request.method(),
        url: request.url(),
        path: url?.pathname ?? request.url(),
        query: url ? parseQueryParams(url.searchParams) : {},
        headers,
        cookies: parseCookieHeader(headers["cookie"]),
        body: parseRequestBody(request),
        resourceType: request.resourceType(),
        initiator: request.frame()?.url() ?? null,
      },
      response: capturedResponse,
      failed,
      error: failed ? { errorText: errorText ?? "Unknown error" } : null,
    };
  }
}

async function safeHeaders(request: Request): Promise<Record<string, string>> {
  try {
    return await request.allHeaders();
  } catch {
    return request.headers();
  }
}

async function buildRedirectChain(request: Request): Promise<RedirectHop[]> {
  const chain: RedirectHop[] = [];
  let current = request.redirectedFrom();

  while (current) {
    const response = await current.response().catch(() => null);
    chain.unshift({ url: current.url(), status: response?.status() ?? 0 });
    current = current.redirectedFrom();
  }

  return chain;
}

function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function safePath(url: string): string {
  return safeUrl(url)?.pathname ?? url;
}

function framePayloadToString(payload: string | Buffer): string {
  return typeof payload === "string" ? payload : payload.toString("base64");
}
