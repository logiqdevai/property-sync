/**
 * READ-ONLY: GET each pushed listing live from EstateWeb (through the agency's own integration,
 * exactly like the app does) and report which ones have NO images there. The cached gallery in
 * `integration_properties.images` is only a cache; this reads the real CRM record.
 *
 * Used by the `mcp-crawl` skill (§9) to verify photos after an automatic CRM push, and to get the
 * exact `user_properties.id`s to pass to `push-images-via-local-chrome.ts --property-ids=...`.
 *
 *   cd api
 *   TS_NODE_TRANSPILE_ONLY=1 npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register \
 *     scripts/check-estateweb-images.ts --cms-sync-run=<id>      # only the CREATE ops of that sync run
 *   ... scripts/check-estateweb-images.ts --agency=<source_agency_id>   # every pushed listing of the agency
 *
 * Output: one line per listing, then `SUMMARY checked=N missing=M` and, if any,
 * `MISSING_IDS=<user_property id>,<user_property id>,...` (comma separated, ready for --property-ids).
 * Exit code 0 even when images are missing (the summary line is the signal).
 */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '../src/shared/config/env/env.module';
import { PrismaModule } from '../src/core/databases/prisma/prisma.module';
import { PrismaService } from '../src/core/databases/prisma/prisma.service';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { EstateWebConfig } from '../src/integrations/estateweb/config/estateweb.config';
import { EstateWebAuthService } from '../src/integrations/estateweb/services/estateweb-auth.service';
import { EstateWebClientService } from '../src/integrations/estateweb/services/estateweb-client.service';
import { EstateWebIntegrationResolverService } from '../src/integrations/estateweb/services/estateweb-integration-resolver.service';
import { EstateWebNotificationService } from '../src/integrations/estateweb/services/estateweb-notification.service';
import { EstateWebPropertyService } from '../src/integrations/estateweb/services/estateweb-property.service';
import { EstateWebSessionService } from '../src/integrations/estateweb/services/estateweb-session.service';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule],
  providers: [
    EstateWebConfig,
    EstateWebNotificationService,
    EstateWebAuthService,
    EstateWebSessionService,
    EstateWebClientService,
    EstateWebIntegrationResolverService,
    EstateWebPropertyService,
  ],
})
class CheckEstateWebImagesModule {}

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1], m[2] ?? 'true');
}

const DELAY_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const syncRunId = args.get('cms-sync-run');
  const agencyId = args.get('agency');
  if (!syncRunId && !agencyId) {
    throw new Error('Pass --cms-sync-run=<id> or --agency=<source_agency_id>');
  }

  const app = await NestFactory.createApplicationContext(CheckEstateWebImagesModule, {
    logger: ['error'],
  });
  try {
    const prisma = app.get(PrismaService);
    const svc = app.get(EstateWebPropertyService);

    // (user_property_id, user_integration_id) pairs to check.
    const targets: Array<{ id: string; integrationId: string; crmId: string }> = [];

    if (syncRunId) {
      const run = await prisma.cmsSyncRun.findUnique({
        where: { id: syncRunId },
        select: { payload: true },
      });
      if (!run) throw new Error(`cms_sync_run ${syncRunId} not found`);
      const payload = run.payload as {
        user_integration_id: string;
        operations: Array<{ operation: string; user_property_id: string }>;
      };
      const ids = payload.operations
        .filter((o) => o.operation === 'CREATE' || o.operation === 'UPDATE')
        .map((o) => o.user_property_id);
      const ups = await prisma.userProperty.findMany({
        where: { id: { in: ids }, integration_property_id: { not: null } },
        select: { id: true, integration_property_id: true },
      });
      for (const up of ups) {
        targets.push({
          id: up.id,
          integrationId: payload.user_integration_id,
          crmId: up.integration_property_id!,
        });
      }
    } else {
      const trackers = await prisma.userTrackedAgency.findMany({
        where: { source_agency_id: agencyId },
        select: {
          user_id: true,
          integration_link: { select: { user_integration_id: true } },
        },
      });
      for (const t of trackers) {
        const integrationId = t.integration_link?.user_integration_id;
        if (!integrationId) continue;
        const ups = await prisma.userProperty.findMany({
          where: {
            user_id: t.user_id,
            integration_property_id: { not: null },
            canonical_property: {
              source_links: { some: { source_property: { source_agency_id: agencyId } } },
            },
          },
          select: { id: true, integration_property_id: true },
        });
        for (const up of ups) {
          targets.push({ id: up.id, integrationId, crmId: up.integration_property_id! });
        }
      }
    }

    const missing: string[] = [];
    let errors = 0;
    for (const t of targets) {
      try {
        const remote = (await svc.getProperty(t.integrationId, t.crmId)) as {
          images?: unknown[];
        };
        const n = (remote.images ?? []).length;
        console.log(`${t.crmId} images=${n}${n === 0 ? ' MISSING' : ''}`);
        if (n === 0) missing.push(t.id);
      } catch (e) {
        errors++;
        console.log(`${t.crmId} ERROR ${String((e as Error).message).slice(0, 100)}`);
      }
      await sleep(DELAY_MS);
    }

    console.log(`SUMMARY checked=${targets.length} missing=${missing.length} errors=${errors}`);
    if (missing.length) console.log(`MISSING_IDS=${missing.join(',')}`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
