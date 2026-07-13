import "dotenv/config";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function estatewebLogin({
  baseUrl,
  email,
  password,
  headless,
  timeoutMs,
  storageStatePath,
  authJsonPath,
} = {}) {
  const resolvedBaseUrl = (baseUrl ?? "https://app.estateweb.gr").replace(
    /\/+$/,
    "",
  );
  const resolvedHeadless =
    headless ??
    (process.env.HEADLESS ? process.env.HEADLESS !== "false" : true);
  const resolvedTimeoutMs = timeoutMs ?? Number(process.env.TIMEOUT_MS ?? 45_000);
  const resolvedStorageStatePath =
    storageStatePath ?? process.env.ESTATEWEB_STORAGE_STATE ?? null;
  const resolvedAuthJsonPath = authJsonPath ?? process.env.ESTATEWEB_AUTH_JSON ?? null;

  const browser = await chromium.launch({ headless: resolvedHeadless });
  const context = await browser.newContext({
    baseURL: resolvedBaseUrl,
    locale: "en-US",
  });
  const page = await context.newPage();

  try {
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: resolvedTimeoutMs });

    const csrf = await page
      .locator('input[name="__csrf"]')
      .getAttribute("value")
      .catch(() => null);

    if (!csrf) {
      throw new Error("Could not find __csrf on /login page");
    }

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);

    const submit = page.locator('form[action="/login"] button');
    await Promise.all([
      page.waitForNavigation({ timeout: resolvedTimeoutMs }).catch(() => null),
      submit.click(),
    ]);

    const url = page.url();
    if (!url.includes("/app")) {
      await page.waitForTimeout(500);
    }

    const cookies = await context.cookies();
    const estateSession = cookies.find((c) => c.name === "estate_session")?.value ?? null;

    if (!estateSession) {
      throw new Error("Login did not yield estate_session cookie");
    }

    const html = await page.content().catch(() => "");
    const tokenMatch = html.match(/var\s+token\s*=\s*'([^']+)'/);
    const token = tokenMatch?.[1] ?? null;

    let storageStateWrittenTo = null;
    if (resolvedStorageStatePath) {
      const state = await context.storageState();
      const outPath = path.isAbsolute(resolvedStorageStatePath)
        ? resolvedStorageStatePath
        : path.join(process.cwd(), resolvedStorageStatePath);
      await fs.writeFile(outPath, JSON.stringify(state, null, 2), "utf-8");
      storageStateWrittenTo = outPath;
    }

    let authJsonWrittenTo = null;
    if (resolvedAuthJsonPath) {
      const outPath = path.isAbsolute(resolvedAuthJsonPath)
        ? resolvedAuthJsonPath
        : path.join(process.cwd(), resolvedAuthJsonPath);
      const auth = {
        baseUrl: resolvedBaseUrl,
        url: page.url(),
        csrf,
        token,
        estateSession,
        generatedAt: new Date().toISOString(),
      };
      await fs.writeFile(outPath, JSON.stringify(auth, null, 2), "utf-8");
      authJsonWrittenTo = outPath;
    }

    return {
      baseUrl: resolvedBaseUrl,
      url: page.url(),
      csrf,
      token,
      estateSession,
      cookies,
      storageStateWrittenTo,
      authJsonWrittenTo,
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

if (process.argv[1] && process.argv[1].endsWith("estateweb-login.js")) {
  const baseUrl = process.env.ESTATEWEB_BASE_URL ?? "https://app.estateweb.gr";
  const email = process.env.ESTATEWEB_EMAIL ?? requiredEnv("ESTATEWEB_EMAIL");
  const password = process.env.ESTATEWEB_PASSWORD ?? requiredEnv("ESTATEWEB_PASSWORD");
  const storageStatePath = process.env.ESTATEWEB_STORAGE_STATE ?? "estateweb-storage-state.json";
  const authJsonPath = process.env.ESTATEWEB_AUTH_JSON ?? "estateweb-auth.json";
  const result = await estatewebLogin({ baseUrl, email, password, storageStatePath, authJsonPath });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export { estatewebLogin };

