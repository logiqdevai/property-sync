import { join } from "path";
import { readFile } from "fs/promises";
import { app, BrowserWindow, dialog, protocol, session, shell } from "electron";
import { isBusy, registerIpc } from "./ipc/register-ipc";

/**
 * The UI is served from `app://property-sync/` rather than file://, so API calls carry a stable
 * Origin the API can allow in CORS (see api/src/main.ts).
 */
const APP_SCHEME = "app";
const APP_HOST = "property-sync";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

function serveRenderer(): void {
  const root = join(__dirname, "../renderer");
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
    // Client-side routes (no file extension) all load index.html.
    const file = /\.[a-z0-9]+$/i.test(relative) ? relative : "index.html";
    const path = join(root, file);
    if (!path.startsWith(root)) return new Response("Not found", { status: 404 });
    try {
      const body = await readFile(path);
      const ext = path.slice(path.lastIndexOf("."));
      return new Response(body, { headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: "Property Sync Crawler",
    backgroundColor: "#1a1916",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("focus", () => mainWindow?.flashFrame(false));

  // Links open in the user's normal browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!isBusy()) return;
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: "question",
      buttons: ["Keep working", "Close anyway"],
      defaultId: 0,
      cancelId: 0,
      title: "A task is still running",
      message: "A crawl or photo check is still running.",
      detail: "If you close the app now, the crawl is saved and you can continue it later.",
    });
    if (choice === 0) event.preventDefault();
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId("com.logiqdev.propertysync.crawler");
    // The app never needs camera/mic/notifications-from-web etc.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    serveRenderer();
    registerIpc();
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}

