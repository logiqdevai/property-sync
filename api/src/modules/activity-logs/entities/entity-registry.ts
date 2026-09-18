/**
 * Maps an auditable entity type to the Prisma delegate used to snapshot it. Secrets are excluded
 * at query time via `omit`, so they never enter memory as snapshot data -- when adding an entity
 * make sure every credential/secret column is listed in `omit`.
 */
export interface EntityDefinition {
  /** Prisma client delegate name, e.g. `userProperty` for `prisma.userProperty`. */
  delegate: string;
  /** Columns never read into a snapshot (secrets, and heavy blobs with no audit value). */
  omit?: Record<string, true>;
}

export const ENTITY_REGISTRY = {
  User: { delegate: 'user', omit: { password: true } },
  UserProperty: { delegate: 'userProperty' },
  Property: { delegate: 'property' },
  SourceProperty: { delegate: 'sourceProperty', omit: { raw_data: true } },
  SourceAgency: { delegate: 'sourceAgency' },
  Scraper: { delegate: 'scraper' },
  ScraperVersion: { delegate: 'scraperVersion' },
  ScraperGenerationRun: { delegate: 'scraperGenerationRun' },
  UserTrackedAgency: { delegate: 'userTrackedAgency' },
  IntegrationTarget: { delegate: 'integrationTarget' },
  UserIntegration: {
    delegate: 'userIntegration',
    omit: {
      api_key_secret: true,
      webhook_key: true,
      password: true,
      config: true, // holds EstateWeb session token/cookie data
    },
  },
  UserIntegrationSettings: { delegate: 'userIntegrationSettings' },
  ContentPublishingConfig: { delegate: 'contentPublishingConfig' },
  NotificationSetting: { delegate: 'notificationSetting' },
  PlatformConfig: { delegate: 'platformConfig' },
  Notification: { delegate: 'notification' },
  CrawlRun: { delegate: 'crawlRun' },
  JobLog: { delegate: 'jobLog', omit: { payload: true, result: true } },
  CmsSyncRun: { delegate: 'cmsSyncRun', omit: { payload: true, response: true } },
} as const satisfies Record<string, EntityDefinition>;

export type AuditEntityType = keyof typeof ENTITY_REGISTRY;

export function getEntityDefinition(
  entity: string,
): EntityDefinition | undefined {
  return (ENTITY_REGISTRY as Record<string, EntityDefinition>)[entity];
}
