// Finds an agency's EstateWeb CRM client by last name (the admin wizard's "Find CRM client by last
// name") and stores its id on the tracker's EstateWeb link (the "CRM client id"). Used by the
// scraper-generation skill after onboard-agency.ts.
//
// USAGE (from api/):
//   npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/find-crm-client.ts --agency=<id | base_url | exact name> --user=<email> --last-name=<text> [--client-id=<n>] [--dry-run]
//
// The search runs through the user's default EstateWeb account, like the wizard. An exact
// (case-insensitive) last_name match is used; with no exact match a single partial hit is used.
// Anything ambiguous prints the candidates and writes nothing, rerun with --client-id=<n> to pick.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/databases/prisma/prisma.service';
import { UserTrackedAgenciesService } from '../src/modules/user-tracked-agencies/user-tracked-agencies.service';

const getFlag = (flag: string): string | undefined => {
  const prefix = `--${flag}=`;
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function main() {
  const ref = getFlag('agency')?.trim();
  const email = getFlag('user')?.trim();
  const lastName = getFlag('last-name')?.trim();
  const forcedId = getFlag('client-id');
  const dryRun = process.argv.includes('--dry-run');
  if (!ref) throw new Error('Missing required --agency=<id | base_url | exact name>');
  if (!email) throw new Error('Missing required --user=<email>');
  if (!lastName && !forcedId) throw new Error('Missing required --last-name=<text>');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const trackedService = app.get(UserTrackedAgenciesService);

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!user) throw new Error(`Unknown user ${email}`);

    const agencies = await prisma.sourceAgency.findMany({
      where: {
        OR: [{ id: ref }, { base_url: ref.replace(/\/+$/, '') }, { name: ref }],
      },
      select: { id: true, name: true },
    });
    if (agencies.length !== 1) {
      throw new Error(`"${ref}" matches ${agencies.length} agencies, use the id`);
    }
    const agency = agencies[0];

    const link = await trackedService.getIntegrationLink(user.id, agency.id);
    if (!link) throw new Error(`${agency.name} has no EstateWeb link for ${email}`);

    let clientId: number;
    if (forcedId) {
      clientId = Number(forcedId);
    } else {
      const { list } = await trackedService.searchIntegrationClients(
        user.id,
        lastName as string,
      );
      const wanted = (lastName as string).toLowerCase();
      const exact = list.filter((c) => c.last_name?.trim().toLowerCase() === wanted);
      const picked = exact.length ? exact : list.length === 1 ? list : [];
      if (picked.length !== 1) {
        console.log(
          JSON.stringify(
            {
              agency: agency.name,
              result: list.length ? 'ambiguous, nothing written' : 'no match, nothing written',
              candidates: list.map((c) => ({
                id: c.id,
                last_name: c.last_name,
                first_name: c.first_name,
                email: c.email,
              })),
            },
            null,
            2,
          ),
        );
        return;
      }
      clientId = picked[0].id;
      console.log(`match: ${picked[0].id} "${picked[0].last_name}" ${picked[0].first_name ?? ''}`);
    }

    console.log(
      `${agency.name}: CRM client id ${link.integration_client_id ?? '-'} -> ${clientId}`,
    );
    if (dryRun) {
      console.log('dry run, nothing written');
      return;
    }
    await trackedService.linkIntegration(
      user.id,
      agency.id,
      link.user_integration_id,
      clientId,
    );
    console.log('updated');
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
