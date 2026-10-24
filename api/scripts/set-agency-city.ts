// Sets SourceAgency.city (the agency's usual area, used to disambiguate same-named places when
// matching a listing's location). Used by the `mcp-crawl` skill, option 2 ("find the agency's
// city"). Plain Prisma, no Nest bootstrap, so it starts in about a second.
//
// USAGE (from api/):
//   npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/set-agency-city.ts --agency=<id | base_url | exact name> --city=<city> [--dry-run]
//   npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/set-agency-city.ts --list-cities
//
// --list-cities prints the distinct city values already stored with counts, so a new value can
// match the existing spelling/language instead of introducing a second variant.

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

const getFlag = (flag: string): string | undefined => {
  const prefix = `--${flag}=`;
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
};

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--list-cities')) {
    const rows = await prisma.sourceAgency.groupBy({
      by: ['city'],
      _count: { _all: true },
      orderBy: { _count: { city: 'desc' } },
    });
    console.log(JSON.stringify(rows.map((r) => ({ city: r.city, agencies: r._count._all })), null, 2));
    return;
  }

  const ref = getFlag('agency')?.trim();
  const city = getFlag('city')?.trim();
  if (!ref) throw new Error('Missing required --agency=<id | base_url | exact name>');
  if (!city) throw new Error('Missing required --city=<city>');

  const matches = await prisma.sourceAgency.findMany({
    where: {
      OR: [{ id: ref }, { base_url: ref.replace(/\/+$/, '') }, { name: ref }],
    },
    select: { id: true, name: true, base_url: true, city: true },
  });
  if (matches.length === 0) throw new Error(`No agency matches "${ref}"`);
  if (matches.length > 1) {
    throw new Error(
      `"${ref}" matches ${matches.length} agencies, use the id: ${matches.map((m) => m.id).join(', ')}`,
    );
  }

  const agency = matches[0];
  console.log(`${agency.name} (${agency.id}): city "${agency.city ?? ''}" -> "${city}"`);
  if (argv.includes('--dry-run')) {
    console.log('dry run, nothing written');
    return;
  }

  await prisma.sourceAgency.update({ where: { id: agency.id }, data: { city } });
  console.log('updated');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
