import fs from 'fs';
import readline from 'node:readline/promises';
import { prisma, OUTPUT_DIR, VERSION_PATH } from './config.js';

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: ${label} not found at ${filePath}. Run "npm run generate" first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Collects answers via the readline async iterator instead of repeated rl.question() calls:
// question() re-arms a one-shot 'line' listener between awaits, which can miss a line that
// arrives (e.g. from a piped/redirected input) before the next question() call attaches it.
async function promptAll(questions) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers = [];
  try {
    process.stdout.write(questions[0]);
    for await (const line of rl) {
      const answer = line.trim();
      if (!answer) {
        console.error('ERROR: value cannot be empty.');
        process.exit(1);
      }
      answers.push(answer);
      if (answers.length >= questions.length) break;
      process.stdout.write(questions[answers.length]);
    }
  } finally {
    rl.close();
  }
  if (answers.length < questions.length) {
    console.error('ERROR: input ended before all values were provided.');
    process.exit(1);
  }
  return answers;
}

async function main() {
  const version = readJson(VERSION_PATH, 'version.json');

  console.log(`Loaded from ${OUTPUT_DIR}:`);
  console.log(`  version.json -> ${version.id}\n`);

  const [sourceAgencyId, scraperName] = await promptAll(['SourceAgency.id: ', 'Scraper.name: ']);

  const sourceAgency = await prisma.sourceAgency.findUnique({ where: { id: sourceAgencyId } });
  if (!sourceAgency) {
    console.error(`ERROR: no SourceAgency found with id "${sourceAgencyId}".`);
    process.exit(1);
  }

  const existing = await prisma.scraper.findFirst({
    where: { source_agency_id: sourceAgencyId, name: scraperName },
  });
  if (existing) {
    console.error(
      `ERROR: a Scraper named "${scraperName}" already exists for "${sourceAgency.name}" (id: ${existing.id}). Aborting.`
    );
    process.exit(1);
  }

  const result = await prisma.$transaction(async tx => {
    const scraper = await tx.scraper.create({
      data: { source_agency_id: sourceAgencyId, name: scraperName },
    });

    const scraperVersion = await tx.scraperVersion.create({
      data: {
        scraper_id: scraper.id,
        version: 1,
        config: version.config,
        created_by: version.created_by,
        notes: version.notes ?? null,
      },
    });

    await tx.scraper.update({
      where: { id: scraper.id },
      data: { active_version_id: scraperVersion.id, version_count: 1 },
    });

    return { scraper, scraperVersion };
  });

  console.log('\nPromoted to production tables:');
  console.log(`  Scraper              ${result.scraper.id}  (${result.scraper.name})`);
  console.log(`  ScraperVersion       ${result.scraperVersion.id}  (v${result.scraperVersion.version}, active)`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
