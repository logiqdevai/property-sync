const APP_NAME = "Property Sync Crawler";
const API_URL = String(import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const APP_URL = String(import.meta.env.VITE_APP_URL ?? "").replace(/\/+$/, "");

export const environments = {
  APP_NAME,
  /** Property Sync API, without a trailing slash. */
  API_URL,
  /** Property Sync web app, without a trailing slash (opened for review and push). */
  APP_URL,
};
