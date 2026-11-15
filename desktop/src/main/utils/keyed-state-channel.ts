import { BrowserWindow } from "electron";

const MAX_LOG_LINES = 80;
const EMIT_INTERVAL_MS = 200;

/**
 * Like StateChannel, for several tasks at once (one per key, e.g. one crawl per agency): holds
 * every task's state and broadcasts the whole map to the UI on `channel`, throttled.
 */
export class KeyedStateChannel<T extends { log: string[] }> {
  private states: Record<string, T> = {};
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly channel: string) {}

  getAll(): Record<string, T> {
    return this.states;
  }

  get(key: string): T | undefined {
    return this.states[key];
  }

  set(key: string, state: T): void {
    this.states = { ...this.states, [key]: state };
    this.schedule();
  }

  patch(key: string, patch: Partial<T>): void {
    const current = this.states[key];
    if (!current) return;
    this.set(key, { ...current, ...patch });
  }

  log(key: string, line: string): void {
    const current = this.states[key];
    if (!current) return;
    const stamped = `${new Date().toLocaleTimeString()}  ${line}`;
    this.set(key, { ...current, log: [...current.log, stamped].slice(-MAX_LOG_LINES) });
  }

  remove(key: string): void {
    if (!(key in this.states)) return;
    const next = { ...this.states };
    delete next[key];
    this.states = next;
    this.schedule();
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(this.channel, this.states);
    }
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), EMIT_INTERVAL_MS);
  }
}
