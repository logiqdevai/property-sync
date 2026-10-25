// Removes shared placeholder images (agency logos, "no photo" banners -- see
// src/integrations/crawler/utils/placeholder-images.util.ts) that earlier crawls already
// stored. The crawler now strips them on its own; this cleans what is already in the DB:
// source_properties.raw_data, canonical properties.images and user_properties.images.
//
// Dry-run unless --apply. Placeholders are detected per agency, from that agency's own
// source_properties, so one agency's file name never affects another's photos.
//
// USAGE (from api/):
//   npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/clean-placeholder-images.ts --agency=<id | base_url | exact name | all> [--apply]
//
// IntegrationProperty.images (photos already pushed to the CRM) is NOT touched: the script
// only reports those user properties, so the CRM-side image delete can be done deliberately.

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  findSharedPlaceholderKeys,
  isSharedPlaceholderImage,
} from '../src/integrations/crawler/utils/placeholder-images.util';

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
const apply = process.argv.includes('--apply');

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

async function cleanAgency(agency: { id: string; name: string }) {
  const sources = await prisma.sourceProperty.findMany({
    where: { source_agency_id: agency.id },
    select: { id: true, raw_data: true },
  });
  const rawOf = (raw: unknown) => (raw ?? {}) as Record<string, unknown>;

  const keys = findSharedPlaceholderKeys(
    sources.map((sp) => {
      const raw = rawOf(sp.raw_data);
      const image = typeof raw.image === 'string' ? [raw.image] : [];
      return [...image, ...asStrings(raw._all_images)];
    }),
  );
  if (keys.size === 0) return;
  console.log(`\n${agency.name} (${agency.id}): placeholders ${[...keys].join(', ')}`);

  const sourceIds: string[] = [];
  for (const sp of sources) {
    const raw = rawOf(sp.raw_data);
    const all = asStrings(raw._all_images);
    const keptAll = all.filter((u) => !isSharedPlaceholderImage(u, keys));
    const imageIsPlaceholder = isSharedPlaceholderImage(raw.image, keys);
    if (keptAll.length === all.length && !imageIsPlaceholder) continue;
    sourceIds.push(sp.id);
    if (apply) {
      await prisma.sourceProperty.update({
        where: { id: sp.id },
        data: {
          raw_data: {
            ...raw,
            image: imageIsPlaceholder ? null : raw.image,
            _all_images: keptAll,
          } as object,
        },
      });
    }
  }
  console.log(`  source_properties with placeholder: ${sourceIds.length}`);

  const links = await prisma.propertySourceLink.findMany({
    where: { source_property: { source_agency_id: agency.id } },
    select: { property_id: true },
  });
  const propertyIds = [...new Set(links.map((l) => l.property_id))];

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    select: { id: true, images: true },
  });
  let propertiesFixed = 0;
  for (const p of properties) {
    const all = asStrings(p.images);
    const kept = all.filter((u) => !isSharedPlaceholderImage(u, keys));
    if (kept.length === all.length) continue;
    propertiesFixed++;
    if (apply) {
      await prisma.property.update({
        where: { id: p.id },
        data: { images: kept },
      });
    }
  }
  console.log(`  canonical properties fixed: ${propertiesFixed}`);

  const userProps = await prisma.userProperty.findMany({
    where: { canonical_property_id: { in: propertyIds } },
    select: {
      id: true,
      images: true,
      integration_properties: { select: { images: true } },
    },
  });
  let userFixed = 0;
  const alreadyInCrm: string[] = [];
  for (const up of userProps) {
    const all = asStrings(up.images);
    const kept = all.filter((u) => !isSharedPlaceholderImage(u, keys));
    if (kept.length === all.length) continue;
    userFixed++;
    if (up.integration_properties.some((ip) => asStrings(ip.images).length > 0)) {
      alreadyInCrm.push(up.id);
    }
    if (apply) {
      await prisma.userProperty.update({
        where: { id: up.id },
        data: { images: kept },
      });
    }
  }
  console.log(`  user_properties fixed: ${userFixed}`);
  if (alreadyInCrm.length > 0) {
    console.log(
      `  ${alreadyInCrm.length} of those have images in the CRM (not touched): ${alreadyInCrm.join(', ')}`,
    );
  }
}

async function main() {
  const ref = getFlag('agency')?.trim();
  if (!ref) throw new Error('Missing required --agency=<id | base_url | exact name | all>');

  const agencies =
    ref === 'all'
      ? await prisma.sourceAgency.findMany({ select: { id: true, name: true } })
      : await prisma.sourceAgency.findMany({
          where: {
            OR: [{ id: ref }, { base_url: ref.replace(/\/+$/, '') }, { name: ref }],
          },
          select: { id: true, name: true },
        });
  if (agencies.length === 0) throw new Error(`No agency matches "${ref}"`);

  console.log(apply ? 'APPLYING changes' : 'DRY RUN (pass --apply to write)');
  for (const agency of agencies) await cleanAgency(agency);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
