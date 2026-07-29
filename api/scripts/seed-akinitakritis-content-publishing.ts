import {
  ContentLanguage,
  DescriptionProductionStrategy,
  PrismaClient,
  TitleProductionStrategy,
} from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const EMAIL = 'akinitakritis@gmail.com';

const GREEK_FAMILY = 'Primary markets (Greek)';
const ENGLISH_FAMILY = 'English markets';

const GREEK_FAMILY_INSTRUCTIONS =
  'Write EVERY title in Greek. Slot codes EL, DE, FR, RU are EstateWeb destinations only. Produce 4 distinct Greek marketing titles (one per slot), using the original Greek title and description. Do not write German, French, or Russian.';

const ENGLISH_FAMILY_INSTRUCTIONS =
  'Write EVERY title in English. Slot codes EN and IT are EstateWeb destinations only. Produce 2 distinct English marketing titles (one per slot), using the original Greek title and description as source. Do not write Italian.';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function replaceConfig(
  trackerId: string,
  input: {
    ai_titles_enabled: boolean;
    use_ai_batch: boolean;
    notes?: string;
    families: Array<{ name: string; instructions?: string | null }>;
    outputs: Array<{
      language: ContentLanguage;
      title_strategy: TitleProductionStrategy;
      description_strategy: DescriptionProductionStrategy;
      familyName?: string;
    }>;
  },
) {
  const existing = await prisma.contentPublishingConfig.findUnique({
    where: { user_tracked_agency_id: trackerId },
    include: { outputs: true, ai_title_families: true },
  });

  if (existing) {
    if (existing.outputs.length) {
      await prisma.contentOutput.deleteMany({
        where: { config_id: existing.id },
      });
    }
    if (existing.ai_title_families.length) {
      await prisma.aiTitleFamily.deleteMany({
        where: { config_id: existing.id },
      });
    }
    await prisma.contentPublishingConfig.update({
      where: { id: existing.id },
      data: {
        ai_titles_enabled: input.ai_titles_enabled,
        use_ai_batch: input.use_ai_batch,
        is_enabled: true,
        notes: input.notes ?? 'Seeded for akinitakritis goal configs',
      },
    });
  } else {
    await prisma.contentPublishingConfig.create({
      data: {
        user_tracked_agency_id: trackerId,
        ai_titles_enabled: input.ai_titles_enabled,
        use_ai_batch: input.use_ai_batch,
        is_enabled: true,
        notes: input.notes ?? 'Seeded for akinitakritis goal configs',
      },
    });
  }

  const config = await prisma.contentPublishingConfig.findUniqueOrThrow({
    where: { user_tracked_agency_id: trackerId },
  });

  const families = await Promise.all(
    input.families.map((family) =>
      prisma.aiTitleFamily.create({
        data: {
          config_id: config.id,
          name: family.name,
          instructions: family.instructions ?? null,
          is_enabled: true,
        },
      }),
    ),
  );
  const familyByName = new Map(families.map((f) => [f.name, f]));

  await Promise.all(
    input.outputs.map((output) =>
      prisma.contentOutput.create({
        data: {
          config_id: config.id,
          language: output.language,
          title_strategy: output.title_strategy,
          description_strategy: output.description_strategy,
          ai_title_family_id: output.familyName
            ? (familyByName.get(output.familyName)?.id ?? null)
            : null,
        },
      }),
    ),
  );
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    throw new Error(`User not found: ${EMAIL}`);
  }

  const trackers = await prisma.userTrackedAgency.findMany({
    where: { user_id: user.id },
    include: {
      source_agency: {
        select: {
          id: true,
          name: true,
          base_url: true,
          content_language: true,
          country: true,
        },
      },
    },
  });

  if (!trackers.length) {
    throw new Error(`No tracked agencies for ${EMAIL}`);
  }

  console.log(`Found ${trackers.length} tracker(s) for ${EMAIL}`);

  for (const tracker of trackers) {
    const agency = tracker.source_agency;
    const looksEnglish =
      agency.content_language === ContentLanguage.EN ||
      /english|uk|britain|usa|america/i.test(agency.name) ||
      agency.country === 'GB' ||
      agency.country === 'UK' ||
      agency.country === 'US';

    let contentLanguage = agency.content_language;
    if (looksEnglish) {
      contentLanguage = ContentLanguage.EN;
    } else if (
      agency.content_language === ContentLanguage.EL ||
      agency.country === 'GR' ||
      /krit|crete|greece|ελλ|ακίνητ|bitsimis/i.test(
        `${agency.name} ${agency.base_url}`,
      )
    ) {
      contentLanguage = ContentLanguage.EL;
    }

    if (agency.content_language !== contentLanguage) {
      await prisma.sourceAgency.update({
        where: { id: agency.id },
        data: { content_language: contentLanguage },
      });
      console.log(
        `Updated ${agency.name} content_language ${agency.content_language} -> ${contentLanguage}`,
      );
    }

    if (contentLanguage === ContentLanguage.EN) {
      await replaceConfig(tracker.id, {
        ai_titles_enabled: false,
        use_ai_batch: false,
        families: [],
        outputs: [
          {
            language: ContentLanguage.EN,
            title_strategy: TitleProductionStrategy.ORIGINAL,
            description_strategy: DescriptionProductionStrategy.ORIGINAL,
          },
          {
            language: ContentLanguage.IT,
            title_strategy: TitleProductionStrategy.ORIGINAL,
            description_strategy: DescriptionProductionStrategy.ORIGINAL,
          },
        ],
      });
      console.log(`Seeded EN config for ${agency.name}`);
      continue;
    }

    await replaceConfig(tracker.id, {
      ai_titles_enabled: true,
      use_ai_batch: true,
      notes:
        'bitsimis: Greek original descriptions on EL/DE/FR/RU; AI Greek titles on those slots; AI English titles + Google EN descriptions on EN/IT',
      families: [
        {
          name: GREEK_FAMILY,
          instructions: GREEK_FAMILY_INSTRUCTIONS,
        },
        {
          name: ENGLISH_FAMILY,
          instructions: ENGLISH_FAMILY_INSTRUCTIONS,
        },
      ],
      outputs: [
        {
          language: ContentLanguage.EL,
          title_strategy: TitleProductionStrategy.AI,
          description_strategy: DescriptionProductionStrategy.ORIGINAL,
          familyName: GREEK_FAMILY,
        },
        {
          language: ContentLanguage.DE,
          title_strategy: TitleProductionStrategy.AI,
          description_strategy: DescriptionProductionStrategy.ORIGINAL,
          familyName: GREEK_FAMILY,
        },
        {
          language: ContentLanguage.FR,
          title_strategy: TitleProductionStrategy.AI,
          description_strategy: DescriptionProductionStrategy.ORIGINAL,
          familyName: GREEK_FAMILY,
        },
        {
          language: ContentLanguage.RU,
          title_strategy: TitleProductionStrategy.AI,
          description_strategy: DescriptionProductionStrategy.ORIGINAL,
          familyName: GREEK_FAMILY,
        },
        {
          language: ContentLanguage.EN,
          title_strategy: TitleProductionStrategy.AI,
          description_strategy: DescriptionProductionStrategy.TRANSLATE,
          familyName: ENGLISH_FAMILY,
        },
        {
          language: ContentLanguage.IT,
          title_strategy: TitleProductionStrategy.AI,
          description_strategy: DescriptionProductionStrategy.TRANSLATE,
          familyName: ENGLISH_FAMILY,
        },
      ],
    });
    console.log(`Seeded EL AI config for ${agency.name}`);
  }

  const verify = await prisma.userTrackedAgency.findMany({
    where: { user_id: user.id },
    include: {
      source_agency: { select: { name: true, content_language: true } },
      content_publishing_config: {
        include: {
          outputs: { include: { ai_title_family: true } },
          ai_title_families: true,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      verify.map((t) => ({
        agency: t.source_agency.name,
        content_language: t.source_agency.content_language,
        ai_titles_enabled: t.content_publishing_config?.ai_titles_enabled,
        families: t.content_publishing_config?.ai_title_families.map((f) => ({
          name: f.name,
          instructions: f.instructions,
        })),
        outputs: t.content_publishing_config?.outputs.map((o) => ({
          language: o.language,
          title: o.title_strategy,
          description: o.description_strategy,
          family: o.ai_title_family?.name ?? null,
        })),
      })),
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
