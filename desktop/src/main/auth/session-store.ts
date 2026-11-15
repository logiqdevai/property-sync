import type { DesktopSession } from "@shared/ipc";

/**
 * The signed-in user's token, handed over by the UI (which owns sign-in). The main process uses it
 * for the crawl's own API calls. Tokens last 30 days, so a crawl never outlives one in practice; if
 * one does expire, the API call fails, the crawl is saved and the user signs in again.
 */
class SessionStore {
  private session: DesktopSession | null = null;

  get(): DesktopSession | null {
    return this.session;
  }

  set(session: DesktopSession | null): void {
    this.session = session;
  }
}

export const sessionStore = new SessionStore();
