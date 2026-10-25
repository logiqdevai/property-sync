// Onboards one or more agencies end to end -- the same steps as the admin "New agency" wizard
// (admin/agencies -> New agency), without the UI. Used by the `mcp-crawl` skill, option 1.
//
// For every agency in the input file, and every user in `users`:
//   1. create the SourceAgency (skipped if one with the same base_url exists) and make sure it is
//      visible + enabled for users
//   2. track it for each user (UserTrackedAgency) -- needs the user to have their default AI
//      (OpenAI) integration connected, exactly like the user's own "Track" switch
//   3. optionally copy the content-publishing config of another agency onto each new tracker
//   4. create a NEW EstateWeb account for each user from the agency's credentials and link it to
//      that user's tracker (an account links to one tracker only, so every user gets their own),
//      with an optional CRM client id
//
// It calls the same services the admin routes call (AgenciesService, UserTrackedAgenciesService,
// UserIntegrationsService, ContentPublishingConfigService), so credentials are encrypted and
// validated exactly as in the app, and every step is idempotent: re-running skips what exists.
//
// USAGE (from api/; reads the same DB as production -- see the skill's §0):
//   npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/onboard-agency.ts --input-file=<path> [--dry-run]
//
// Input file (JSON):
//   {
//     "users": ["person@example.com"],
//     "copy_publishing_from": "<agency id | base_url | exact name>",      // optional
//     "agencies": [
//       {
//         "name": "ΣΤΑΘΟΠΟΥΛΟΣ - ΠΑΤΡΑ",
//         "base_url": "https://stathopoulosmesitiko.gr",
//         "estateweb": { "email": "...", "password": "..." },             // or { "username", "password" }
//         "city": "Πάτρα", "country": "GR", "content_language": "EL",    // all optional
//         "crawl_interval": "0 9 * * *",                                  // optional, default 09:00 daily
//         "crm_client_id": 12345                                          // optional
//       }
//     ]
//   }
//
// Prints one JSON summary at the end. Credentials are never echoed.

import { promises as fsp } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/databases/prisma/prisma.service';
import { AgenciesService } from '../src/modules/agencies/agencies.service';
import { UserTrackedAgenciesService } from '../src/modules/user-tracked-agencies/user-tracked-agencies.service';
import { UserIntegrationsService } from '../src/modules/user-integrations/user-integrations.service';
import { ContentPublishingConfigService } from '../src/modules/content-publishing/services/content-publishing-config.service';
import { UpsertContentPublishingConfigDto } from '../src/modules/content-publishing/dto/upsert-content-publishing-config.dto';
import {
  AuthRole,
  AuthType,
  ContentLanguage,
  IntegrationType,
} from '../src/generated/prisma';

interface AgencyInput {
  name: string;
  base_url: string;
  estateweb: { email?: string; username?: string; password: string };
  city?: string;
  country?: string;
  content_language?: ContentLanguage;
  crawl_interval?: string;
  crm_client_id?: number;
}

// New agencies crawl once a day at 09:00 (scheduler timezone, Europe/Athens),
// not the schema default of every 6 hours.
const DEFAULT_ONBOARD_CRAWL_INTERVAL = '0 9 * * *';

interface InputFile {
  users: string[];
  copy_publishing_from?: string;
  agencies: AgencyInput[];
}

interface UserStepResult {
  email: string;
  tracked: string;
  publishing: string;
  estateweb: string;
}

interface AgencyResult {
  name: string;
  base_url: string;
  agency_id?: string;
  agency: string;
  users: UserStepResult[];
  error?: string;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

async function loadInput(path: string): Promise<InputFile> {
  const parsed = JSON.parse(await fsp.readFile(path, 'utf8')) as InputFile;
  if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
    throw new Error('"users" must be a non-empty array of emails');
  }
  if (!Array.isArray(parsed.agencies) || parsed.agencies.length === 0) {
    throw new Error('"agencies" must be a non-empty array');
  }
  for (const [index, agency] of parsed.agencies.entries()) {
    if (!agency.name || !agency.base_url) {
      throw new Error(`agencies[${index}] needs "name" and "base_url"`);
    }
    if (!agency.estateweb?.password) {
      throw new Error(`agencies[${index}].estateweb needs a "password"`);
    }
    if (!agency.estateweb.email && !agency.estateweb.username) {
      throw new Error(`agencies[${index}].estateweb needs "email" or "username"`);
    }
  }
  return parsed;
}

async function main() {
  const argv = process.argv.slice(2);
  const inputFile = argv.find((a) => a.startsWith('--input-file='))?.slice(13);
  const dryRun = argv.includes('--dry-run');
  if (!inputFile) throw new Error('Missing required --input-file=<path>');

  const input = await loadInput(inputFile);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const agenciesService = app.get(AgenciesService);
    const trackedService = app.get(UserTrackedAgenciesService);
    const integrationsService = app.get(UserIntegrationsService);
    const publishingService = app.get(ContentPublishingConfigService);

    const users = await prisma.user.findMany({
      where: {
        email: {
          in: input.users.map((e) => e.trim()),
          mode: 'insensitive',
        },
      },
      select: { id: true, email: true },
    });
    const missingUsers = input.users.filter(
      (email) =>
        !users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase()),
    );
    if (missingUsers.length) {
      throw new Error(`Unknown user(s): ${missingUsers.join(', ')}`);
    }

    const target = await prisma.integrationTarget.findFirst({
      where: { integration_type: IntegrationType.ESTATEWEB },
    });
    if (!target) throw new Error('No EstateWeb integration target exists');
    if (
      target.auth_type !== AuthType.EMAIL_PASSWORD &&
      target.auth_type !== AuthType.USERNAME_PASSWORD
    ) {
      throw new Error(`Unsupported EstateWeb auth type ${target.auth_type}`);
    }

    let publishingSourceId: string | null = null;
    if (input.copy_publishing_from) {
      const ref = input.copy_publishing_from.trim();
      const source = await prisma.sourceAgency.findFirst({
        where: {
          OR: [{ id: ref }, { base_url: normalizeUrl(ref) }, { name: ref }],
        },
        select: { id: true, name: true },
      });
      if (!source) {
        throw new Error(`copy_publishing_from agency not found: ${ref}`);
      }
      publishingSourceId = source.id;
    }

    const results: AgencyResult[] = [];

    for (const item of input.agencies) {
      const baseUrl = normalizeUrl(item.base_url);
      const result: AgencyResult = {
        name: item.name,
        base_url: baseUrl,
        agency: 'pending',
        users: [],
      };
      results.push(result);

      try {
        let agency = await prisma.sourceAgency.findUnique({
          where: { base_url: baseUrl },
        });

        if (!agency) {
          if (dryRun) {
            result.agency = 'would create';
          } else {
            agency = await agenciesService.create({
              name: item.name.trim(),
              base_url: baseUrl,
              ...(item.city && { city: item.city }),
              country: item.country ?? 'GR',
              crawl_interval:
                item.crawl_interval ?? DEFAULT_ONBOARD_CRAWL_INTERVAL,
              ...(item.content_language && {
                content_language: item.content_language,
              }),
              is_visible: true,
              is_enabled: true,
            });
            result.agency = 'created';
          }
        } else {
          result.agency = 'already existed';
          if (!agency.is_visible || !agency.is_enabled) {
            if (!dryRun) {
              agency = await agenciesService.updateVisibility(agency.id, {
                is_visible: true,
                is_enabled: true,
              });
            }
            result.agency += ' (made visible/enabled)';
          }
        }
        result.agency_id = agency?.id;

        for (const user of users) {
          const row: UserStepResult = {
            email: user.email,
            tracked: 'skipped',
            publishing: 'skipped',
            estateweb: 'skipped',
          };
          result.users.push(row);

          if (dryRun || !agency) {
            row.tracked = row.publishing = row.estateweb = 'dry-run';
            continue;
          }

          try {
            await trackedService.track(user.id, agency.id, {});
            row.tracked = 'ok';
          } catch (error) {
            row.tracked = `FAILED: ${errorMessage(error)}`;
            continue;
          }

          if (publishingSourceId && publishingSourceId !== agency.id) {
            try {
              const source = await publishingService.getForTrackedAgency(
                user.id,
                publishingSourceId,
              );
              if (!source) {
                row.publishing = 'source agency has no config for this user';
              } else {
                const dto: UpsertContentPublishingConfigDto = {
                  ai_titles_enabled: source.ai_titles_enabled,
                  use_ai_batch: source.use_ai_batch,
                  is_enabled: source.is_enabled,
                  notes: source.notes,
                  ai_title_families: source.ai_title_families.map((f) => ({
                    name: f.name,
                    model: f.model,
                    use_batch: f.use_batch,
                    instructions: f.instructions,
                    writing_language: f.writing_language,
                    is_enabled: f.is_enabled,
                  })),
                  outputs: source.outputs.map((o) => ({
                    language: o.language,
                    title_strategy: o.title_strategy,
                    description_strategy: o.description_strategy,
                    description_content_language: o.description_content_language,
                    ai_title_family: o.ai_title_family_name,
                  })),
                };
                await publishingService.upsertForTrackedAgency(
                  user.id,
                  agency.id,
                  dto,
                );
                row.publishing = 'copied';
              }
            } catch (error) {
              row.publishing = `FAILED: ${errorMessage(error)}`;
            }
          }

          try {
            const existingLink = await trackedService.getIntegrationLink(
              user.id,
              agency.id,
            );
            if (existingLink) {
              row.estateweb = 'already linked';
              if (
                item.crm_client_id !== undefined &&
                existingLink.integration_client_id !== item.crm_client_id
              ) {
                await trackedService.linkIntegration(
                  user.id,
                  agency.id,
                  existingLink.user_integration_id,
                  item.crm_client_id,
                );
                row.estateweb += ' (client id set)';
              }
              continue;
            }

            const credentials =
              target.auth_type === AuthType.EMAIL_PASSWORD
                ? { email: item.estateweb.email, password: item.estateweb.password }
                : {
                    username: item.estateweb.username,
                    password: item.estateweb.password,
                  };
            const connection = await integrationsService.createConnection(
              user.id,
              AuthRole.ADMIN,
              { integration_target_id: target.id, ...credentials },
            );
            await trackedService.linkIntegration(
              user.id,
              agency.id,
              connection.id,
              item.crm_client_id,
            );
            row.estateweb = 'connected + linked';
          } catch (error) {
            row.estateweb = `FAILED: ${errorMessage(error)}`;
          }
        }
      } catch (error) {
        result.error = errorMessage(error);
      }
    }

    console.log(JSON.stringify({ dry_run: dryRun, results }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
