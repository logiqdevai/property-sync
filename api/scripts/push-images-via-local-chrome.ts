// Manual ops tool: push a property's scraped images to its linked EstateWeb
// CRM by downloading them through a REAL, locally-installed Chrome browser
// instead of the server's normal fetch() call.
//
// WHY THIS EXISTS
// ----------------
// Some agency websites (confirmed: openhousechania.com, lafazanihomes.com --
// see docs/crawler-bot-detection-blocking.md and docs/proxy-cost-analysis.md)
// block Railway's datacenter IP with Cloudflare bot-management. The crawler
// already works around this for *crawling* by routing those two scrapers'
// page navigation through Bright Data's managed browser
// (Scraper.use_managed_browser -- see StealthBrowserService), but on purpose
// never downloads actual image bytes during a crawl (only the <img src> URL
// string, to avoid paying Bright Data's per-GB bandwidth cost on every photo
// of every listing -- see docs/proxy-cost-analysis.md). The plan was to fetch
// real image bytes "later, when actually needed" -- but every place that
// later download actually happens (EstateWebCmsSyncAdapter.downloadImage,
// WatermarkRemovalService.downloadImage, sold-watermark-detection.util.ts)
// is a bare server-side fetch() with no proxy/stealth at all, so it hits the
// exact same Cloudflare block and 403s.
//
// Routing THAT download step through Bright Data too would fix it, but adds
// real ongoing bandwidth cost to a feature (pushing/re-checking images) that
// runs far more often than a one-time crawl. Instead, this script downloads
// the images through a real, visible, locally-installed Chrome -- driven via
// the Chrome DevTools Protocol, the same underlying protocol the "chrome
// devtools" MCP tool uses -- running on a normal computer/office network
// rather than Railway's flagged datacenter IP. A real Chrome + a normal
// residential/office IP is exactly what Cloudflare's challenge is built to
// let through, at zero ongoing cost (no Bright Data, no proxy fees). The
// trade-off is that it CANNOT run unattended on Railway/CI: it opens a real,
// visible browser window on whatever machine runs it, so it's meant to be
// run manually, on demand, from a developer's own computer.
//
// HOW IT REUSES PRODUCTION CODE
// ------------------------------
// Only the "download these bytes" step is replaced. Everything else --
// resolving the property's linked EstateWeb integration
// (EstateWebIntegrationResolverService), building the upload payload and
// calling the EstateWeb API (EstateWebCmsSyncAdapter.createImages ->
// EstateWebPropertyService.uploadPropertyImage), and refreshing our cached
// IntegrationProperty.images afterwards (UserPropertiesService's existing
// "migrate CMS images" flow) -- is the exact same code the deployed app uses
// for the normal "push images to CRM" feature. We get the real
// EstateWebCmsSyncAdapter singleton from Nest's DI container and monkey-patch
// its private downloadImage() for the lifetime of this script's process only
// (this never touches the deployed server -- it's a separate, short-lived
// Node process on your machine).
//
// USAGE
// -----
// Run locally only (never on Railway/CI). Requires Google Chrome installed
// (not just Playwright's bundled Chromium -- run `npx playwright install
// chrome` once if launch fails with a "channel not found" error). Point it
// at whichever environment's database/EstateWeb credentials you need via
// dotenv, same as any other script in this folder:
//
//   npx dotenv -e .env.production -- npx node -r tsconfig-paths/register -r ts-node/register scripts/push-images-via-local-chrome.ts --agency=openhousechania
//   npx dotenv -e .env.production -- npx node -r tsconfig-paths/register -r ts-node/register scripts/push-images-via-local-chrome.ts --property-ids=<id1>,<id2>
//   npx dotenv -e .env.production -- npx node -r tsconfig-paths/register -r ts-node/register scripts/push-images-via-local-chrome.ts --dry-run
//
// (needs `node -r tsconfig-paths/register -r ts-node/register`, not plain
// `ts-node`, because this bootstraps the real Nest app graph, which is full
// of `@/...` path-aliased imports that plain ts-node can't resolve)
//
// Flags:
//   --agency=<substring>     Match SourceAgency.base_url (case-insensitive).
//                            Works for ANY agency, not just the two named
//                            above -- pass whichever blocked agency's domain
//                            you're dealing with.
//   --property-ids=id1,id2   Explicit UserProperty ids instead of an agency
//                            match. Takes priority over --agency.
//   --retry-log=<path>       Re-run ONLY the specific images a previous run
//                            logged as a "[download] ... for <url>" failure
//                            (e.g. after fixing a downloader bug), read from
//                            that run's saved stdout. Skips normal selection
//                            entirely and re-uploads exactly those URLs per
//                            property -- not the property's whole image list
//                            -- so images that already succeeded are never
//                            re-uploaded/duplicated. Takes priority over
//                            --agency/--property-ids.
//   --limit=N                Cap how many properties are processed. Ignored
//                            with --retry-log.
//   --dry-run                List what would be pushed, download/upload
//                            nothing, open no browser.
//   (no --agency/--property-ids/--retry-log)  Defaults to every property
//                            whose source agency has a Scraper with
//                            use_managed_browser = true (today: the 2 known
//                            Cloudflare-blocked agencies) and that already
//                            has a linked CMS property.
//
// CAVEAT: like the existing manual "Upload to CRM" gallery action, there is
// no de-dup against images already pushed -- re-running the normal (non
// --retry-log) modes on a property that was already pushed will upload
// duplicate photos in EstateWeb. Redirect stdout to a file (`... | tee
// run.log`) so you have something to pass to --retry-log if some images
// fail partway through a large run.

import { promises as fs } from 'fs';
import { NestFactory } from '@nestjs/core';
import { chromium, Page } from 'playwright';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/databases/prisma/prisma.service';
import { UserPropertiesService } from '../src/modules/user-properties/user-properties.service';
import { CmsSyncAdapterFactory } from '../src/modules/cms-sync/services/cms-sync-adapter.factory';
import { EstateWebCmsSyncAdapter } from '../src/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { EstateWebIntegrationResolverService } from '../src/integrations/estateweb/services/estateweb-integration-resolver.service';
import { MigrateIntegrationImagesMode } from '../src/modules/user-properties/dto/migrate-integration-images.dto';
import { IntegrationType, Prisma } from '../src/generated/prisma';

interface ScriptArgs {
  propertyIds: string[];
  agency?: string;
  limit?: number;
  dryRun: boolean;
  retryLog?: string;
}

function parseArgs(): ScriptArgs {
  const argv = process.argv.slice(2);
  const getFlag = (flag: string): string | undefined => {
    const prefix = `--${flag}=`;
    const match = argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
  };

  const propertyIdsRaw = getFlag('property-ids');
  const limitRaw = getFlag('limit');

  return {
    propertyIds: propertyIdsRaw
      ? propertyIdsRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [],
    agency: getFlag('agency'),
    limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
    dryRun: argv.includes('--dry-run'),
    retryLog: getFlag('retry-log'),
  };
}

// Parses a previous run's stdout (redirected to a file) and returns only the
// specific image URLs that logged a "[download] ..." failure, grouped by the
// property they belong to -- so a fix to the downloader can be re-run
// WITHOUT re-uploading the images that already succeeded (there's no dedup
// against EstateWeb, so blindly re-running a whole property re-uploads every
// photo as a duplicate). Understands any "[download] <reason> for <url>"
// line this script itself logs (no response captured / HTTP NNN / navigation
// error / failed), grouped by the most recent "[i/N] property=<id>" line
// above it.
async function loadRetryTargets(
  logPath: string,
): Promise<Map<string, string[]>> {
  const content = await fs.readFile(logPath, 'utf8');
  const propertyLineRe = /^\[\d+\/\d+]\s+property=(\S+)/;
  const urlRe = /for (https?:\/\/\S+)/;

  const targets = new Map<string, Set<string>>();
  let currentPropertyId: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    const propertyMatch = line.match(propertyLineRe);
    if (propertyMatch) {
      currentPropertyId = propertyMatch[1];
      continue;
    }
    if (!currentPropertyId || !line.includes('[download]')) continue;

    const urlMatch = line.match(urlRe);
    if (!urlMatch) continue;

    const urls = targets.get(currentPropertyId) ?? new Set<string>();
    urls.add(urlMatch[1]);
    targets.set(currentPropertyId, urls);
  }

  return new Map([...targets].map(([id, urls]) => [id, [...urls]]));
}

// Same 5-line lookup as UserPropertiesService's private resolveSourceAgencyId
// -- trivial data-shape read, not worth bootstrapping around.
async function resolveSourceAgencyId(
  prisma: PrismaService,
  canonicalPropertyId: string,
): Promise<string | null> {
  const link = await prisma.propertySourceLink.findFirst({
    where: { property_id: canonicalPropertyId },
    include: { source_property: { select: { source_agency_id: true } } },
  });
  return link?.source_property.source_agency_id ?? null;
}

async function selectTargetProperties(prisma: PrismaService, args: ScriptArgs) {
  const where: Prisma.UserPropertyWhereInput = {};

  if (args.propertyIds.length > 0) {
    where.id = { in: args.propertyIds };
  } else {
    let agencyIds: string[];

    if (args.agency) {
      const agencies = await prisma.sourceAgency.findMany({
        where: { base_url: { contains: args.agency, mode: 'insensitive' } },
        select: { id: true, name: true, base_url: true },
      });
      if (agencies.length === 0) {
        throw new Error(`No SourceAgency found matching "${args.agency}"`);
      }
      console.log(
        `Matched agencies: ${agencies.map((a) => `${a.name} (${a.base_url})`).join(', ')}`,
      );
      agencyIds = agencies.map((a) => a.id);
    } else {
      const blockedScrapers = await prisma.scraper.findMany({
        where: { use_managed_browser: true },
        select: { source_agency_id: true },
      });
      agencyIds = [...new Set(blockedScrapers.map((s) => s.source_agency_id))];
      console.log(
        `No --agency given; defaulting to the ${agencyIds.length} scraper(s) flagged ` +
          `use_managed_browser=true (the currently-known Cloudflare-blocked agencies).`,
      );
    }

    where.integration_property_id = { not: null };
    where.canonical_property = {
      source_links: {
        some: { source_property: { source_agency_id: { in: agencyIds } } },
      },
    };
  }

  return prisma.userProperty.findMany({
    where,
    select: {
      id: true,
      user_id: true,
      canonical_property_id: true,
      integration_property_id: true,
      images: true,
    },
    ...(args.limit ? { take: args.limit } : {}),
  });
}

function extractImageUrls(images: unknown): string[] {
  return Array.isArray(images)
    ? images.filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      )
    : [];
}

interface PropertyRef {
  id: string;
  user_id: string;
  canonical_property_id: string;
  integration_property_id: string | null;
}

// Shared by the normal (full property) path and the --retry-log (specific
// URLs only) path: resolves the property's linked EstateWeb integration,
// uploads exactly the given URLs via the (downloadImage-patched) adapter,
// then refreshes the cached IntegrationProperty.images. Throws on failure --
// callers count successes/failures around this.
async function pushImagesForProperty(
  ctx: {
    prisma: PrismaService;
    resolver: EstateWebIntegrationResolverService;
    adapter: EstateWebCmsSyncAdapter;
    userPropertiesService: UserPropertiesService;
  },
  property: PropertyRef,
  sourceImageUrls: string[],
): Promise<'pushed' | 'skipped'> {
  if (!property.integration_property_id) {
    console.log('  skipped — not linked to a CMS');
    return 'skipped';
  }
  if (sourceImageUrls.length === 0) {
    console.log('  skipped — no images to push');
    return 'skipped';
  }

  const sourceAgencyId = await resolveSourceAgencyId(
    ctx.prisma,
    property.canonical_property_id,
  );
  if (!sourceAgencyId) {
    console.log('  skipped — could not resolve source agency');
    return 'skipped';
  }

  const { userIntegrationId } = await ctx.resolver.resolveForTrackedAgency(
    property.user_id,
    sourceAgencyId,
  );

  console.log(
    `  downloading + uploading ${sourceImageUrls.length} image(s) via local Chrome…`,
  );
  await ctx.adapter.createImages({
    userIntegrationId,
    crmPropertyId: property.integration_property_id,
    userPropertyId: property.id,
    sourceImageUrls,
  });

  console.log('  refreshing IntegrationProperty.images from EstateWeb…');
  await ctx.userPropertiesService.migrateIntegrationImagesForUserProperty(
    property.user_id,
    property.id,
    MigrateIntegrationImagesMode.REMAP_SOURCES,
  );

  console.log('  done.');
  return 'pushed';
}

// Cloudflare's managed challenge sets a cf_clearance cookie on the browser
// context after the JS challenge clears on a real page load. Hitting a raw
// image URL cold (without ever having loaded an HTML page on that origin
// first) can fail the same way a bare fetch() does -- so visit the origin's
// homepage once per domain and give the challenge a few seconds before
// downloading any of its images.
async function warmUpOrigin(
  page: Page,
  origin: string,
  warmedOrigins: Set<string>,
): Promise<void> {
  if (warmedOrigins.has(origin)) return;
  warmedOrigins.add(origin);

  try {
    console.log(`  [warmup] visiting ${origin}…`);
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
  } catch (error) {
    console.warn(
      `  [warmup] failed for ${origin}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Drop-in replacement for EstateWebCmsSyncAdapter's private downloadImage():
// same signature (Buffer | null on failure, never throws), so createImages()
// keeps working completely unchanged once this is swapped in.
function createRealChromeImageDownloader(
  page: Page,
  warmedOrigins: Set<string>,
) {
  return async (url: string): Promise<Buffer | null> => {
    try {
      const origin = new URL(url).origin;
      await warmUpOrigin(page, origin, warmedOrigins);

      // Originally this matched the navigation's response by comparing
      // response.url() === url via a separate waitForResponse() call. That
      // silently dropped every image whose path has non-ASCII characters
      // (e.g. Greek "Στιγμιότυπο-οθόνης" screenshot filenames): Chrome
      // percent-encodes the URL it actually requests, so response.url()
      // never string-matched the raw, unencoded url we started with, and
      // waitForResponse timed out even though the image loaded fine. Using
      // page.goto()'s own return value sidesteps string matching entirely --
      // it's simply the Response for whatever navigation just happened, no
      // matter how the browser encoded the URL on the wire.
      let response: Awaited<ReturnType<Page['goto']>> = null;
      const downloadPromise = page
        .waitForEvent('download', { timeout: 30000 })
        .catch(() => null);

      try {
        response = await page.goto(url, {
          waitUntil: 'commit',
          timeout: 30000,
        });
      } catch (error) {
        // Navigating straight to an image asset sometimes makes Chrome trigger
        // its native "Save As" download flow instead of rendering it inline --
        // page.goto() throws in that case instead of resolving, so fall
        // through to the download-event fallback below.
        if (!/download is starting/i.test(String(error))) {
          console.warn(
            `  [download] navigation error for ${url}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (response) {
        if (!response.ok()) {
          console.warn(`  [download] HTTP ${response.status()} for ${url}`);
          return null;
        }
        return await response.body();
      }

      const download = await downloadPromise;
      if (download) {
        const path = await download.path();
        if (path) {
          return await fs.readFile(path);
        }
      }

      console.warn(`  [download] no response or download captured for ${url}`);
      return null;
    } catch (error) {
      console.warn(
        `  [download] failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  };
}

async function main() {
  const args = parseArgs();

  console.log('Bootstrapping the app (Prisma, EstateWeb integration, etc.)…');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const userPropertiesService = app.get(UserPropertiesService);
    const cmsSyncAdapterFactory = app.get(CmsSyncAdapterFactory);
    const resolver = app.get(EstateWebIntegrationResolverService);

    // work: exactly which property + which URLs to push. Normally that's
    // every scraped image on each selected property; with --retry-log it's
    // only the specific URLs a previous run logged as failed downloads, so a
    // downloader fix can be re-run without re-uploading (and duplicating)
    // everything that already succeeded.
    let work: Array<{ property: PropertyRef; sourceImageUrls: string[] }>;

    if (args.retryLog) {
      const retryTargets = await loadRetryTargets(args.retryLog);
      if (retryTargets.size === 0) {
        console.log(
          `No "[download] ... for <url>" failures found in ${args.retryLog}. Nothing to retry.`,
        );
        return;
      }
      const properties = await prisma.userProperty.findMany({
        where: { id: { in: [...retryTargets.keys()] } },
        select: {
          id: true,
          user_id: true,
          canonical_property_id: true,
          integration_property_id: true,
        },
      });
      const byId = new Map(properties.map((p) => [p.id, p]));
      work = [...retryTargets].flatMap(([propertyId, sourceImageUrls]) => {
        const property = byId.get(propertyId);
        if (!property) {
          console.warn(
            `  skipping retry for ${propertyId} — property no longer found`,
          );
          return [];
        }
        return [{ property, sourceImageUrls }];
      });
      console.log(
        `Loaded ${work.length} propert${work.length === 1 ? 'y' : 'ies'} with failed image(s) to retry from ${args.retryLog}.`,
      );
    } else {
      const properties = await selectTargetProperties(prisma, args);
      console.log(
        `Selected ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}.`,
      );
      work = properties.map((property) => ({
        property,
        sourceImageUrls: extractImageUrls(property.images),
      }));
    }

    if (work.length === 0) {
      console.log('No matching properties found. Nothing to do.');
      return;
    }

    if (args.dryRun) {
      for (const { property, sourceImageUrls } of work) {
        console.log(
          `  [dry-run] ${property.id} — ${sourceImageUrls.length} image(s), ` +
            `integration_property_id=${property.integration_property_id ?? 'none'}`,
        );
      }
      return;
    }

    console.log(
      'Launching your local Chrome (a visible window will open — leave it alone while this runs)…',
    );
    const browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const warmedOrigins = new Set<string>();

    const adapter = cmsSyncAdapterFactory.getAdapter(
      IntegrationType.ESTATEWEB,
    ) as EstateWebCmsSyncAdapter;
    // `downloadImage` is a TypeScript-private method -- private is a
    // compile-time-only concept, so overriding the instance's own property at
    // runtime is safe and only affects this script's process.
    (
      adapter as unknown as {
        downloadImage: (url: string) => Promise<Buffer | null>;
      }
    ).downloadImage = createRealChromeImageDownloader(page, warmedOrigins);

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    const ctx = { prisma, resolver, adapter, userPropertiesService };

    try {
      for (const [index, { property, sourceImageUrls }] of work.entries()) {
        console.log(`\n[${index + 1}/${work.length}] property=${property.id}`);
        try {
          const outcome = await pushImagesForProperty(
            ctx,
            property,
            sourceImageUrls,
          );
          if (outcome === 'skipped') skipped += 1;
          else succeeded += 1;
        } catch (error) {
          failed += 1;
          console.error(
            `  FAILED: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } finally {
      await browser.close().catch(() => undefined);
    }

    console.log(
      `\nFinished. ${succeeded} succeeded, ${skipped} skipped, ${failed} failed (of ${work.length}).`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exitCode = 1;
});
