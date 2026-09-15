// Simple counting semaphore gating how many callers hold a slot at once.
// `limit` is re-read on every acquire (see StealthBrowserService), so an
// admin lowering PlatformConfig.crawler_max_concurrent_browser_pages takes
// effect on the next acquire without a restart -- growing the limit also
// immediately wakes enough queued waiters to fill the new headroom.
export class AsyncSemaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  async acquire(limit: number): Promise<() => void> {
    if (this.active >= Math.max(1, limit)) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}
