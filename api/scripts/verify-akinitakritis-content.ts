import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
});

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'akinitakritis@gmail.com' },
  });
  const configs = await prisma.contentPublishingConfig.count();
  const outputs = await prisma.contentOutput.count();
  const families = await prisma.aiTitleFamily.count();
  const localized = await prisma.propertyLocalizedContent.count();
  const trackers = await prisma.userTrackedAgency.findMany({
    where: { user_id: user!.id },
    include: {
      source_agency: { select: { id: true, name: true, content_language: true } },
      content_publishing_config: {
        include: { outputs: true, ai_title_families: true },
      },
    },
  });
  console.log(
    JSON.stringify(
      {
        user_id: user?.id,
        totals: { configs, outputs, families, localized },
        trackers: trackers.map((t) => ({
          tracker_id: t.id,
          agency_id: t.source_agency_id,
          agency: t.source_agency.name,
          content_language: t.source_agency.content_language,
          config_id: t.content_publishing_config?.id ?? null,
          outputs: t.content_publishing_config?.outputs.map((o) => o.language),
          families: t.content_publishing_config?.ai_title_families.map(
            (f) => f.name,
          ),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
