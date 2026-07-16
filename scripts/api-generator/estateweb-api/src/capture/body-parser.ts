import type { Request } from "playwright";
import type { CapturedRequestBody } from "../types/capture.types.js";

export function parseRequestBody(request: Request): CapturedRequestBody {
  let raw: string | null = null;

  try {
    raw = request.postData();
  } catch {
    raw = null;
  }

  if (!raw) return { raw: null, parsed: null, encoding: "none" };

  const contentType = request.headers()["content-type"] ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { raw, parsed: safeParseUrlEncoded(raw), encoding: "form-urlencoded" };
  }

  if (contentType.includes("multipart/form-data")) {
    return {
      raw: `[multipart/form-data, ${raw.length} bytes]`,
      parsed: parseMultipart(raw, contentType),
      encoding: "multipart",
    };
  }

  const json = safeParseJson(raw);
  if (json !== undefined) {
    return { raw, parsed: json, encoding: "json" };
  }

  return { raw, parsed: raw, encoding: "text" };
}

interface MultipartField {
  name: string;
  filename: string | null;
  value: string | null;
}

function parseMultipart(raw: string, contentType: string): MultipartField[] {
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch?.[1]) return [];

  const boundary = `--${boundaryMatch[1]}`;
  const parts = raw.split(boundary).filter((part) => part.trim() && part.trim() !== "--");

  return parts.map((part) => {
    const nameMatch = part.match(/name="([^"]+)"/);
    const filenameMatch = part.match(/filename="([^"]*)"/);
    const value = part.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, "");

    return {
      name: nameMatch?.[1] ?? "unknown",
      filename: filenameMatch ? (filenameMatch[1] ?? "") : null,
      value: filenameMatch ? `[binary file data, ${value.length} bytes]` : value.trim(),
    };
  });
}

function safeParseUrlEncoded(raw: string): Record<string, string> {
  try {
    return Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return {};
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
