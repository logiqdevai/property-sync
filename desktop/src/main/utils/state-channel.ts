import { BrowserWindow } from "electron";

const MAX_LOG_LINES = 80;
const EMIT_INTERVAL_MS = 150;

/**
 * Holds a task's state and broadcasts it to the UI on `channel`, throttled so a fast crawl doesn't
 * flood the renderer with updates.
 */
export class StateChannel<T extends { log: string[] }> {
  private state: T;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly channel: string,
    private readonly initial: () => T,
  ) {
    this.state = initial();
  }

  get(): T {
    return this.state;
  }

  patch(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    this.schedule();
  }

  log(line: string): void {
    const stamped = `${new Date().toLocaleTimeString()}  ${line}`;
    this.state = { ...this.state, log: [...this.state.log, stamped].slice(-MAX_LOG_LINES) };
    this.schedule();
  }

  reset(patch: Partial<T> = {}): void {
    this.state = { ...this.initial(), ...patch };
    this.flush();
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(this.channel, this.state);
    }
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), EMIT_INTERVAL_MS);
  }
}
