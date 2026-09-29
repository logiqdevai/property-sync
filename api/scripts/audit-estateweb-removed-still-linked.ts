// One-off audit script: for every UserProperty marked REMOVED/SOLD in our system that is
// still linked to an EstateWeb listing (integration_property_id set), check the LIVE
// EstateWeb record and report whether any site is still selected=true there.
//
// Read-only: only calls EstateWebPropertyService.getProperty (GET). Never mutates.
//
// Run with (from api/):
//   NODE_PATH=$PWD/node_modules npx ts-node -r tsconfig-paths/register scripts/audit-estateweb-removed-still-linked.ts
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
class EstateWebAuditModule {}

const CONCURRENCY = 4;
const DELAY_MS = 150;

async function main() {
  const app = await NestFactory.createApplicationContext(EstateWebAuditModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const propertyService = app.get(EstateWebPropertyService);

    const rows = await prisma.userProperty.findMany({
      where: {
        status: { in: ['REMOVED', 'SOLD'] },
        integration_property_id: { not: null },
      },
      select: {
        id: true,
        user_id: true,
        status: true,
        title: true,
        integration_property_id: true,
        canonical_property: {
          select: {
            source_links: {
              select: {
                source_property: {
                  select: { source_agency_id: true, source_url: true },
                },
              },
              take: 1,
            },
          },
        },
      },
    });

    console.log(`Found ${rows.length} REMOVED/SOLD user_properties with integration_property_id set.\n`);

    // Resolve each row's user_integration_id via the EstateWeb integration link for its
    // user + source agency.
    const results: Array<{
      user_property_id: string;
      status: string;
      title: string;
      integration_property_id: string;
      stillLiveSiteCount: number | null;
      error?: string;
    }> = [];

    let index = 0;
    async function worker() {
      while (index < rows.length) {
        const row = rows[index++];
        const sourceAgencyId =
          row.canonical_property.source_links[0]?.source_property
            .source_agency_id;
        if (!sourceAgencyId) {
          results.push({
            user_property_id: row.id,
            status: row.status,
            title: row.title,
            integration_property_id: row.integration_property_id!,
            stillLiveSiteCount: null,
            error: 'no source_agency_id resolvable',
          });
          continue;
        }

        const tracker = await prisma.userTrackedAgency.findUnique({
          where: {
            user_id_source_agency_id: {
              user_id: row.user_id,
              source_agency_id: sourceAgencyId,
            },
          },
          select: {
            integration_link: { select: { user_integration_id: true } },
          },
        });
        const userIntegrationId = tracker?.integration_link?.user_integration_id;
        if (!userIntegrationId) {
          results.push({
            user_property_id: row.id,
            status: row.status,
            title: row.title,
            integration_property_id: row.integration_property_id!,
            stillLiveSiteCount: null,
            error: 'no EstateWeb integration link for this tracker',
          });
          continue;
        }

        try {
          const remote = await propertyService.getProperty(
            userIntegrationId,
            row.integration_property_id!,
          );
          // EstateWeb's GET response for `sites` never includes a `selected`
          // field -- confirmed live. Every entry in the array IS a currently
          // published site, so array length alone is the "still live" signal.
          const liveSites = (remote.sites ?? []).length;
          results.push({
            user_property_id: row.id,
            status: row.status,
            title: row.title,
            integration_property_id: row.integration_property_id!,
            stillLiveSiteCount: liveSites,
          });
        } catch (error) {
          results.push({
            user_property_id: row.id,
            status: row.status,
            title: row.title,
            integration_property_id: row.integration_property_id!,
            stillLiveSiteCount: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => worker()),
    );

    const stillLive = results.filter((r) => (r.stillLiveSiteCount ?? 0) > 0);
    const confirmedUnpublished = results.filter(
      (r) => r.stillLiveSiteCount === 0,
    );
    const errored = results.filter((r) => r.error);

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total checked:            ${results.length}`);
    console.log(`Still live on EstateWeb:  ${stillLive.length}`);
    console.log(`Correctly unpublished:    ${confirmedUnpublished.length}`);
    console.log(`Errored / unresolved:     ${errored.length}`);

    console.log(`\n=== STILL LIVE (need re-push) ===`);
    for (const r of stillLive) {
      console.log(
        `${r.user_property_id}\tstatus=${r.status}\tcrm_id=${r.integration_property_id}\tsites=${r.stillLiveSiteCount}\t${r.title}`,
      );
    }

    if (errored.length) {
      console.log(`\n=== ERRORED ===`);
      for (const r of errored) {
        console.log(`${r.user_property_id}\t${r.error}`);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
