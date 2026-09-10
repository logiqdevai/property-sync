// Ingests items collected by the `mcp-crawl` skill (a chrome-devtools-MCP-
// driven crawl, used when the server's Playwright crawler gets blocked by an
// agency's bot protection -- see .claude/skills/mcp-crawl/SKILL.md) into the
// SAME downstream pipeline a normal server-side crawl uses from this point
// on: upsert SourceProperty rows, then trigger AI normalization, which
// creates/updates canonical Property rows and auto-creates UserProperty rows
// for every enabled tracked user of the agency.
//
// WHY THIS EXISTS
// ----------------
// CrawlerService.runCrawl() and DetailEnrichmentService.enrichDetailPages()
// are tightly coupled to a live Playwright Page/Browser they create
// themselves (via StealthBrowserService) -- there's no way to hand them a
// Page sourced from somewhere else, so they can't be reused for an
// MCP-driven session. Everything AFTER those two steps, though, is plain
// data in: the SourceProperty-upsert block in crawl.processor.ts only needs
// `{ source_url, raw }` items and a source_agency_id, and
// PropertyNormalizationService.normalizeForCrawlRun() only needs a
// `CrawlRun` id. This script reimplements that upsert block (same field
// mapping, same pure utility functions) and then calls the real
// normalizeForCrawlRun() -- so nothing about normalization, EstateWeb
// field resolution, or UserProperty creation is duplicated or
// reimplemented; only the "get raw scraped data" step differs from a normal
// crawl.
//
// SAFETY: THIS NEVER PUSHES TO THE CRM
// -------------------------------------
// normalizeForCrawlRun() creates Property/UserProperty rows but never
// itself calls the EstateWeb API (confirmed by tracing
// syncAfterNormalization -> CmsSyncOrchestratorService.planAndEnqueueCrawlSync
// -> groupByTracker: it silently drops every item unless the owning user
// already has an ENABLED UserTrackedAgency with an ACTIVE EstateWeb
// integration link, and even then CREATE/UPDATE pushes require that
// tracker's `auto_update_to_crm` flag, which defaults to false). As a
// defense-in-depth check anyway (in case this agency already has a linked
// tracker with auto_update_to_crm=true from before), this script aborts
// before writing anything if it finds one -- pass --force to proceed
// regardless (you'll want to if that's expected/intentional).
//
// USAGE
// -----
//   npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/mcp-crawl-ingest.ts --scraper-id=<id> --items-file=<path>
//   npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/mcp-crawl-ingest.ts --scraper-id=<id> --items-file=<path> --dry-run
//
// (needs `node -r tsconfig-paths/register -r ts-node/register`, not plain
// `ts-node` -- see push-images-via-local-chrome.ts's header for why)
//
// Flags:
//   --scraper-id=<uuid>   Required. The Scraper these items belong to.
//   --items-file=<path>   Required. A JSON file: an array of
//                         { source_url: string, raw: Record<string, unknown> }
//                         -- the same shape CrawlItem has in
//                         scraper-config.interface.ts. `raw` may contain any
//                         of the fields crawl.processor.ts's upsert block
//                         reads (title, price, location, _detail_text,
//                         _all_images, _raw_html_path, _crawl_exclude,
//                         _detail_enrichment_error, plus the denormalized-
//                         field aliases extractDenormalizedRawFields looks
//                         for -- see that function for the full list).
//   --dry-run             Parse + validate + run the pre-flight safety
//                         check, print what would happen, write nothing.
//   --force               Proceed even if the pre-flight safety check finds
//                         a tracker with auto_update_to_crm=true already
//                         linked for this agency.

import { promises as fsp } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/databases/prisma/prisma.service';
import { PropertyNormalizationService } from '../src/modules/properties/services/property-normalization.service';
import {
  contentHash,
  extractDenormalizedRawFields,
  extractPriceFromText,
  extractSourcePropertyIds,
  mergeImagesDedupingSizeVariants,
} from '../src/integrations/crawler/utils/crawler.utils';
import { isAccessBarrierTitle } from '../src/integrations/crawler/block-handling/block-handling.utils';
import { CrawlItem } from '../src/integrations/crawler/interfaces/scraper-config.interface';
import {
  CrawlRunStatus,
  Prisma,
  PropertyStatus,
} from '../src/generated/prisma';

interface ScriptArgs {
  scraperId?: string;
  itemsFile?: string;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(): ScriptArgs {
  const argv = process.argv.slice(2);
  const getFlag = (flag: string): string | undefined => {
    const prefix = `--${flag}=`;
    const match = argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
  };

  return {
    scraperId: getFlag('scraper-id'),
    itemsFile: getFlag('items-file'),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  };
}

async function loadItems(path: string): Promise<CrawlItem[]> {
  const content = await fsp.readFile(path, 'utf8');
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON array of {source_url, raw}`);
  }
  for (const [index, item] of parsed.entries()) {
    if (
      !item ||
      typeof item.source_url !== 'string' ||
      !item.source_url ||
      typeof item.raw !== 'object' ||
      item.raw === null
    ) {
      throw new Error(
        `Item ${index} is not a valid { source_url: string, raw: object } -- got ${JSON.stringify(item)}`,
      );
    }
  }
  return parsed as CrawlItem[];
}

async function main() {
  const args = parseArgs();
  if (!args.scraperId) throw new Error('Missing required --scraper-id=<uuid>');
  if (!args.itemsFile) throw new Error('Missing required --items-file=<path>');

  console.log('Bootstrapping the app (Prisma, normalization pipeline, etc.)…');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const propertyNormalizationService = app.get(PropertyNormalizationService);

    const scraper = await prisma.scraper.findUnique({
      where: { id: args.scraperId },
      select: { id: true, name: true, source_agency_id: true },
    });
    if (!scraper) {
      throw new Error(`Scraper ${args.scraperId} not found`);
    }
    console.log(
      `Scraper: ${scraper.name} (${scraper.id}), source_agency_id=${scraper.source_agency_id}`,
    );

    // Defense in depth -- see the SAFETY comment at the top of this file.
    // normalizeForCrawlRun() itself already gates any real CRM push behind
    // an enabled tracked agency + active EstateWeb link + auto_update_to_crm,
    // but if this specific agency already has one configured that way from
    // before, warn loudly and require an explicit --force instead of
    // silently pushing new listings to a live CRM.
    const riskyTrackers = await prisma.userTrackedAgency.findMany({
      where: {
        source_agency_id: scraper.source_agency_id,
        enabled: true,
        auto_update_to_crm: true,
        integration_link: { user_integration: { is_active: true } },
      },
      select: { id: true, user_id: true },
    });
    if (riskyTrackers.length > 0 && !args.force) {
      throw new Error(
        `${riskyTrackers.length} tracked user(s) of this agency already have auto_update_to_crm=true ` +
          `with an active EstateWeb link -- normalization WILL push new/updated listings to their CRM ` +
          `automatically. Re-run with --force if that's expected, otherwise turn that flag off first.`,
      );
    }
    if (riskyTrackers.length > 0) {
      console.warn(
        `--force set: proceeding despite ${riskyTrackers.length} tracker(s) with auto_update_to_crm=true.`,
      );
    }

    const items = await loadItems(args.itemsFile);
    console.log(`Loaded ${items.length} item(s) from ${args.itemsFile}.`);

    if (args.dryRun) {
      console.log(
        '[dry-run] Would upsert SourceProperty rows and call normalizeForCrawlRun(). Nothing written.',
      );
      return;
    }

    const startedAt = new Date();
    const crawlRun = await prisma.crawlRun.create({
      data: {
        source_agency_id: scraper.source_agency_id,
        scraper_id: scraper.id,
        status: CrawlRunStatus.RUNNING,
        started_at: startedAt,
        metadata: { source: 'mcp-crawl' } as object,
      },
    });
    console.log(`Created CrawlRun ${crawlRun.id}`);

    // Mirrors crawl.processor.ts's SourceProperty-upsert loop (same field
    // mapping, same pure utility functions) -- see that file if this drifts.
    const seenUrls = new Set<string>();
    let totalCreated = 0;
    let totalUpdated = 0;
    const now = new Date();

    for (const item of items) {
      if (seenUrls.has(item.source_url)) continue;

      const raw = item.raw ?? {};
      if (raw._crawl_exclude === true) continue;
      seenUrls.add(item.source_url);

      if (Array.isArray(raw._all_images)) {
        raw._all_images = mergeImagesDedupingSizeVariants(
          raw._all_images as string[],
        );
      }

      const denormalized = extractDenormalizedRawFields(raw);
      const { property_id: propertyId, internal_id: internalId } =
        extractSourcePropertyIds(item.source_url, raw);
      const priceText =
        (raw.price as string | undefined) ??
        extractPriceFromText(
          raw.title as string | undefined,
          raw._detail_text as string | undefined,
        ) ??
        null;
      const rawHtmlPath =
        typeof raw._raw_html_path === 'string' ? raw._raw_html_path : null;
      const hash = contentHash({
        url: item.source_url,
        title: raw.title,
        price: priceText,
      });

      const existing = await prisma.sourceProperty.findUnique({
        where: {
          source_agency_id_source_url: {
            source_agency_id: scraper.source_agency_id,
            source_url: item.source_url,
          },
        },
        select: { id: true },
      });

      const detailFailed =
        typeof raw._detail_enrichment_error === 'string' &&
        raw._detail_enrichment_error.length > 0;
      const barrierTitle = isAccessBarrierTitle(
        typeof raw.title === 'string' ? raw.title : null,
      );

      if (existing && (detailFailed || barrierTitle)) {
        await prisma.sourceProperty.update({
          where: { id: existing.id },
          data: { last_seen_at: now, status: PropertyStatus.ACTIVE },
        });
        totalUpdated += 1;
        continue;
      }

      const safeTitle = barrierTitle
        ? null
        : ((raw.title as string | undefined) ?? null);

      await prisma.sourceProperty.upsert({
        where: {
          source_agency_id_source_url: {
            source_agency_id: scraper.source_agency_id,
            source_url: item.source_url,
          },
        },
        create: {
          source_agency_id: scraper.source_agency_id,
          property_id: propertyId,
          internal_id: internalId,
          source_url: item.source_url,
          raw_title: safeTitle,
          raw_description: (raw._detail_text as string | undefined) ?? null,
          raw_price: priceText,
          raw_location: (raw.location as string | undefined) ?? null,
          ...denormalized,
          raw_data: raw as Prisma.InputJsonValue,
          raw_html_path: rawHtmlPath,
          content_hash: hash,
          first_seen_at: now,
          last_seen_at: now,
          status: PropertyStatus.ACTIVE,
        },
        update: {
          property_id: propertyId,
          internal_id: internalId,
          raw_title: safeTitle,
          raw_description: (raw._detail_text as string | undefined) ?? null,
          raw_price: priceText,
          raw_location: (raw.location as string | undefined) ?? null,
          ...denormalized,
          raw_data: raw as Prisma.InputJsonValue,
          ...(rawHtmlPath ? { raw_html_path: rawHtmlPath } : {}),
          content_hash: hash,
          last_seen_at: now,
          status: PropertyStatus.ACTIVE,
        },
      });

      if (existing) totalUpdated += 1;
      else totalCreated += 1;
    }

    const finishedAt = new Date();
    const runFailed = seenUrls.size === 0;
    await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: runFailed ? CrawlRunStatus.FAILED : CrawlRunStatus.SUCCESS,
        finished_at: finishedAt,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        total_found: seenUrls.size,
        total_new_listings: totalCreated,
        total_refreshed_listings: totalUpdated,
        error_message: runFailed ? 'No items ingested' : null,
      },
    });

    console.log(
      `SourceProperty upsert done: ${totalCreated} created, ${totalUpdated} updated/touched (of ${items.length} item(s), ${seenUrls.size} unique).`,
    );

    if (runFailed) {
      console.log('Nothing to normalize -- skipping normalizeForCrawlRun().');
      return;
    }

    console.log('Kicking off AI normalization (background)…');
    await propertyNormalizationService.normalizeForCrawlRun(crawlRun.id);

    console.log(
      `\nDone. CrawlRun ${crawlRun.id} is normalizing in the background (BullMQ chunks or an OpenAI ` +
        `Batch submission -- this does not block on completion). No CRM push happens as part of this. ` +
        `Track progress in the app's Crawl Runs / Job Queue pages, then review the new UserProperty ` +
        `rows for this agency before doing anything with the CRM.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exitCode = 1;
});
