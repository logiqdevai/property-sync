export interface IgnoreConfig {
  /** Hostname patterns to drop. Supports exact matches, suffix matches, and "*.example.com" wildcards. */
  hostnames: string[];
  /** Resource types (as reported by Playwright) to always drop, regardless of the capture* flags. */
  resourceTypes: string[];
}

export interface CaptureConfig {
  startUrl: string;
  headless: boolean;
  /** Supports a "{{index}}" placeholder, resolved to the next free session number. */
  outputFile: string;
  /** Persistent Chromium profile directory — preserves cookies, session storage and local storage across runs. */
  userDataDir: string;
  captureImages: boolean;
  captureFonts: boolean;
  captureStylesheets: boolean;
  captureScripts: boolean;
  captureXHR: boolean;
  captureFetch: boolean;
  captureWebSockets: boolean;
  /** Response bodies larger than this are recorded with metadata only (truncated: true), to bound memory usage. */
  maxBodySizeBytes: number;
  ignore: IgnoreConfig;
}
