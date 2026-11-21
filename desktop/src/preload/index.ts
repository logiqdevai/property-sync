import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IpcChannels, type DesktopBridge } from "@shared/ipc";

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: DesktopBridge = {
  auth: {
    setSession: (session) => ipcRenderer.invoke(IpcChannels.SET_SESSION, session),
  },
  app: {
    info: () => ipcRenderer.invoke(IpcChannels.APP_INFO),
    openExternal: (url) => ipcRenderer.invoke(IpcChannels.OPEN_EXTERNAL, url),
    checkBrowser: () => ipcRenderer.invoke(IpcChannels.BROWSER_CHECK),
  },
  crawl: {
    start: (request) => ipcRenderer.invoke(IpcChannels.CRAWL_START, request),
    startQueue: (requests, concurrency) =>
      ipcRenderer.invoke(IpcChannels.CRAWL_START_QUEUE, requests, concurrency),
    stop: (scraperId) => ipcRenderer.invoke(IpcChannels.CRAWL_STOP, scraperId),
    dismiss: (scraperId) => ipcRenderer.invoke(IpcChannels.CRAWL_DISMISS, scraperId),
    getStates: () => ipcRenderer.invoke(IpcChannels.CRAWL_STATE),
    onStates: (listener) => subscribe(IpcChannels.CRAWL_STATE, listener),
    getCheckpoint: (scraperId) => ipcRenderer.invoke(IpcChannels.CRAWL_CHECKPOINT, scraperId),
    listCheckpoints: () => ipcRenderer.invoke(IpcChannels.CRAWL_CHECKPOINTS),
  },
  update: {
    getState: () => ipcRenderer.invoke(IpcChannels.UPDATE_STATE),
    onState: (listener) => subscribe(IpcChannels.UPDATE_STATE, listener),
    install: () => ipcRenderer.invoke(IpcChannels.UPDATE_INSTALL),
  },
  photos: {
    start: (request) => ipcRenderer.invoke(IpcChannels.PHOTOS_START, request),
    startQueue: (requests, concurrency) =>
      ipcRenderer.invoke(IpcChannels.PHOTOS_START_QUEUE, requests, concurrency),
    stop: (agencyId) => ipcRenderer.invoke(IpcChannels.PHOTOS_STOP, agencyId),
    dismiss: (agencyId) => ipcRenderer.invoke(IpcChannels.PHOTOS_DISMISS, agencyId),
    getStates: () => ipcRenderer.invoke(IpcChannels.PHOTOS_STATE),
    onStates: (listener) => subscribe(IpcChannels.PHOTOS_STATE, listener),
  },
};

contextBridge.exposeInMainWorld("desktop", bridge);
