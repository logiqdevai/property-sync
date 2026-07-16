import type { Response } from "playwright";
import type { CaptureFormat, CapturedResponse } from "../types/capture.types.js";

export async function parseResponseBody(response: Response, maxBodySizeBytes: number): Promise<CapturedResponse> {
  const headers = await safeAllHeaders(response);
  const cookies = await parseSetCookieHeaders(response);
  const mimeType = (headers["content-type"] ?? "").split(";")[0]?.trim() || "unknown";
  const status = response.status();

  const buffer = await safeBody(response);
  const size = buffer?.length ?? 0;

  if (!buffer || size === 0) {
    return { status, headers, cookies, mimeType, format: "unknown", body: null, size, truncated: false };
  }

  const format = detectFormat(mimeType, buffer);

  if (size > maxBodySizeBytes) {
    return { status, headers, cookies, mimeType, format, body: null, size, truncated: true };
  }

  return { status, headers, cookies, mimeType, format, body: decodeBody(buffer, format), size, truncated: false };
}

async function safeAllHeaders(response: Response): Promise<Record<string, string>> {
  try {
    return await response.allHeaders();
  } catch {
    return {};
  }
}

async function safeBody(response: Response): Promise<Buffer | null> {
  try {
    return await response.body();
  } catch {
    return null;
  }
}

async function parseSetCookieHeaders(response: Response): Promise<Record<string, string>> {
  const cookies: Record<string, string> = {};

  let headersArray: Array<{ name: string; value: string }>;
  try {
    headersArray = await response.headersArray();
  } catch {
    return cookies;
  }

  for (const { name, value } of headersArray) {
    if (name.toLowerCase() !== "set-cookie") continue;
    const pair = value.split(";")[0] ?? "";
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) continue;
    cookies[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
  }

  return cookies;
}

function detectFormat(mimeType: string, buffer: Buffer): CaptureFormat {
  if (mimeType.includes("json")) return "json";
  if (mimeType.includes("html")) return "html";
  if (mimeType.includes("xml")) return "xml";
  if (mimeType.startsWith("text/")) return "text";
  if (isTextualScriptMime(mimeType)) return "text";
  if (mimeType === "unknown" || mimeType === "") return isProbablyText(buffer) ? "text" : "unknown";
  return "binary";
}

function isTextualScriptMime(mimeType: string): boolean {
  return ["application/javascript", "application/x-javascript", "application/ecmascript"].includes(mimeType);
}

function decodeBody(buffer: Buffer, format: CaptureFormat): unknown {
  try {
    switch (format) {
      case "json":
        return JSON.parse(buffer.toString("utf-8"));
      case "text":
      case "html":
      case "xml":
        return buffer.toString("utf-8");
      case "binary":
        return buffer.toString("base64");
      default:
        return isProbablyText(buffer) ? buffer.toString("utf-8") : buffer.toString("base64");
    }
  } catch {
    return buffer.toString("base64");
  }
}

/** Heuristic: a chunk containing NUL bytes is treated as binary rather than text. */
function isProbablyText(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 512);
  for (let i = 0; i < sampleLength; i += 1) {
    if (buffer[i] === 0) return false;
  }
  return true;
}
