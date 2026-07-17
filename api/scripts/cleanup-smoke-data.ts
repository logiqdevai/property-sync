import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const SMOKE_AGENCY_IDS = [
  'c9bb2133-ac35-4ea0-92de-86f440fb6590',
  'e658255e-ddc5-488e-b603-1547b65636ed',
];

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const agencies = await prisma.sourceAgency.findMany({
    where: {
      OR: [
        { id: { in: SMOKE_AGENCY_IDS } },
        { name: { contains: 'Smoke', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true },
  });

  if (agencies.length === 0) {
    console.log('No smoke agencies found.');
  } else {
  const agencyIds = agencies.map((a) => a.id);
  console.log('Cleaning agencies:', agencies.map((a) => a.name).join(', '));

  const scrapers = await prisma.scraper.findMany({
    where: { source_agency_id: { in: agencyIds } },
    select: { id: true },
  });
  const scraperIds = scrapers.map((s) => s.id);

  const crawlRuns = await prisma.crawlRun.findMany({
    where: { source_agency_id: { in: agencyIds } },
    select: { id: true },
  });
  const crawlRunIds = crawlRuns.map((c) => c.id);

  const sourceProperties = await prisma.sourceProperty.findMany({
    where: { source_agency_id: { in: agencyIds } },
    select: { id: true },
  });
  const sourcePropertyIds = sourceProperties.map((sp) => sp.id);

  const propertyLinks = await prisma.propertySourceLink.findMany({
    where: { source_property_id: { in: sourcePropertyIds } },
    select: { property_id: true },
  });
  const propertyIds = [...new Set(propertyLinks.map((l) => l.property_id))];

  const generationRuns = await prisma.scraperGenerationRun.findMany({
    where: { source_agency_id: { in: agencyIds } },
    select: { id: true },
  });
  const generationRunIds = generationRuns.map((g) => g.id);

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({
      where: {
        OR: [
          { source_agency_id: { in: agencyIds } },
          { scraper_id: { in: scraperIds } },
          { crawl_run_id: { in: crawlRunIds } },
        ],
      },
    });

    if (propertyIds.length > 0) {
      // cms_sync_runs are per-crawl-run batches now (no user_property link) --
      // they cascade-delete below via tx.crawlRun.deleteMany.
      await tx.userProperty.deleteMany({
        where: { property_id: { in: propertyIds } },
      });
      await tx.propertyHistory.deleteMany({
        where: { property_id: { in: propertyIds } },
      });
      await tx.propertySourceLink.deleteMany({
        where: { property_id: { in: propertyIds } },
      });
      await tx.property.deleteMany({
        where: { id: { in: propertyIds } },
      });
    }

    await tx.sourceProperty.deleteMany({
      where: { source_agency_id: { in: agencyIds } },
    });

    if (crawlRunIds.length > 0) {
      await tx.jobLog.deleteMany({
        where: { crawl_run_id: { in: crawlRunIds } },
      });
    }

    if (scraperIds.length > 0) {
      await tx.scraperExecutionTrace.deleteMany({
        where: { scraper_id: { in: scraperIds } },
      });
    }

    if (generationRunIds.length > 0) {
      await tx.computerUseStep.deleteMany({
        where: { scraper_generation_run_id: { in: generationRunIds } },
      });
      await tx.scraperGenerationRun.updateMany({
        where: { id: { in: generationRunIds } },
        data: { produced_version_id: null, scraper_id: null },
      });
      await tx.scraperGenerationRun.deleteMany({
        where: { id: { in: generationRunIds } },
      });
    }

    await tx.crawlRun.deleteMany({
      where: { source_agency_id: { in: agencyIds } },
    });

    for (const scraperId of scraperIds) {
      await tx.scraper.update({
        where: { id: scraperId },
        data: { active_version_id: null },
      });
    }

    if (scraperIds.length > 0) {
      await tx.scraperVersion.deleteMany({
        where: { scraper_id: { in: scraperIds } },
      });
      await tx.scraper.deleteMany({
        where: { id: { in: scraperIds } },
      });
    }

    await tx.userTrackedAgency.deleteMany({
      where: { source_agency_id: { in: agencyIds } },
    });

    await tx.sourceAgency.deleteMany({
      where: { id: { in: agencyIds } },
    });
  });

  console.log(
    `Removed ${agencyIds.length} agencies, ${scraperIds.length} scrapers, ${crawlRunIds.length} crawl runs, ${propertyIds.length} properties.`,
  );
  }

  const smokeTargets = await prisma.integrationTarget.findMany({
    where: { integration_type: 'OPENAI' },
    select: { id: true },
  });
  for (const target of smokeTargets) {
    await prisma.userIntegration.deleteMany({
      where: { integration_target_id: target.id },
    });
    await prisma.integrationTarget.delete({ where: { id: target.id } });
  }

  console.log(`Removed ${smokeTargets.length} integration targets.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
