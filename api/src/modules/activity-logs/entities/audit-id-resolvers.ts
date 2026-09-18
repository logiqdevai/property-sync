import type { Request } from 'express';
import type { AuditContext } from '../decorators/audited.decorator';

/**
 * Id resolvers for entities that routes address by a composite key rather than by `id`
 * (e.g. `/agencies/:agencyId/track` means "the current user's UserTrackedAgency for that
 * agency"). Used as `@Audited({ ids: ... })`; they run before and after the handler.
 */

type AuthedRequest = Request & { user?: { id?: string } };

const currentUserId = (req: Request): string | undefined =>
  (req as AuthedRequest).user?.id;

const one = (id: string | undefined | null): string[] => (id ? [id] : []);

/** `/agencies/:agencyId/...` -> the current user's tracked-agency row. */
export const trackedAgencyOfCurrentUser = async (
  req: Request,
  { prisma }: AuditContext,
): Promise<string[]> => {
  const user_id = currentUserId(req);
  const source_agency_id = req.params.agencyId;
  if (!user_id || !source_agency_id) return [];
  const row = await prisma.userTrackedAgency.findUnique({
    where: { user_id_source_agency_id: { user_id, source_agency_id } },
    select: { id: true },
  });
  return one(row?.id);
};

/** `/admin/agencies/:id/trackers/:userId` -> that user's tracked-agency row. */
export const trackedAgencyOfAdminTarget = async (
  req: Request,
  { prisma }: AuditContext,
): Promise<string[]> => {
  const row = await prisma.userTrackedAgency.findUnique({
    where: {
      user_id_source_agency_id: {
        user_id: req.params.userId,
        source_agency_id: req.params.id,
      },
    },
    select: { id: true },
  });
  return one(row?.id);
};

/** `/agencies/:agencyId/track/content-publishing` -> the tracked agency's publishing config. */
export const contentPublishingConfigOfCurrentUser = async (
  req: Request,
  { prisma }: AuditContext,
): Promise<string[]> => {
  const user_id = currentUserId(req);
  const source_agency_id = req.params.agencyId;
  if (!user_id || !source_agency_id) return [];
  const row = await prisma.contentPublishingConfig.findFirst({
    where: { user_tracked_agency: { user_id, source_agency_id } },
    select: { id: true },
  });
  return one(row?.id);
};

/** `/integrations/targets/:targetId/settings` -> the current user's settings for that target. */
export const integrationSettingsOfCurrentUser = async (
  req: Request,
  { prisma }: AuditContext,
): Promise<string[]> => {
  const user_id = currentUserId(req);
  const integration_target_id = req.params.targetId;
  if (!user_id || !integration_target_id) return [];
  const row = await prisma.userIntegrationSettings.findUnique({
    where: { user_id_integration_target_id: { user_id, integration_target_id } },
    select: { id: true },
  });
  return one(row?.id);
};

/** `/admin/integration-targets/:id/users/:userId/settings` -> that user's settings row. */
export const integrationSettingsOfAdminTarget = async (
  req: Request,
  { prisma }: AuditContext,
): Promise<string[]> => {
  const row = await prisma.userIntegrationSettings.findUnique({
    where: {
      user_id_integration_target_id: {
        user_id: req.params.userId,
        integration_target_id: req.params.id,
      },
    },
    select: { id: true },
  });
  return one(row?.id);
};

/** `/admin/notification-settings/:type` -> the setting row for that notification type. */
export const notificationSettingByType = async (
  req: Request,
  { prisma }: AuditContext,
): Promise<string[]> => {
  const row = await prisma.notificationSetting.findFirst({
    where: { type: req.params.type as never },
    select: { id: true },
  });
  return one(row?.id);
};

/** PlatformConfig is a single-row table with a fixed id. */
export const platformConfigSingleton = (): string[] => ['singleton'];

/** `/users/me/...` -> the authenticated user's own row. */
export const currentUser = (req: Request): string[] => one(currentUserId(req));
