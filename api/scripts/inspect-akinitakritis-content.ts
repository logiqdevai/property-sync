import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findUnique({
    where: { email: 'akinitakritis@gmail.com' },
  });
  if (!user) {
    console.log('USER_NOT_FOUND');
    await prisma.$disconnect();
    await pool.end();
    return;
  }
  console.log('USER', user.id, user.email);

  const trackers = await prisma.userTrackedAgency.findMany({
    where: { user_id: user.id },
    include: {
      source_agency: {
        select: {
          id: true,
          name: true,
          base_url: true,
          content_language: true,
        },
      },
      content_publishing_config: {
        include: { outputs: true, ai_title_families: true },
      },
    },
  });

  console.log(
    JSON.stringify(
      trackers.map((t) => ({
        tracker_id: t.id,
        agency: t.source_agency.name,
        base_url: t.source_agency.base_url,
        content_language: t.source_agency.content_language,
        has_config: !!t.content_publishing_config,
        outputs: t.content_publishing_config?.outputs?.map((o) => ({
          lang: o.language,
          title: o.title_strategy,
          desc: o.description_strategy,
        })),
        families: t.content_publishing_config?.ai_title_families?.map(
          (f) => f.name,
        ),
      })),
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
