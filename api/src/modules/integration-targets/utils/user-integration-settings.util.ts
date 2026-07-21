import { PrismaService } from '@/core/databases/prisma/prisma.service';

/// Finds or creates the shared UserIntegrationSettings row for a (user, integration_target)
/// pair, so every UserIntegration account created for that pair can link to it.
export function ensureUserIntegrationSettings(
  prisma: PrismaService,
  userId: string,
  integrationTargetId: string,
) {
  return prisma.userIntegrationSettings.upsert({
    where: {
      user_id_integration_target_id: {
        user_id: userId,
        integration_target_id: integrationTargetId,
      },
    },
    create: {
      user_id: userId,
      integration_target_id: integrationTargetId,
    },
    update: {},
  });
}
