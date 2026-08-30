import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import {
  CONTENT_PRODUCTION_QUEUE,
  CRM_CLIENT_NOTES_SYNC_QUEUE,
  DELETE_INTEGRATION_IMAGES_QUEUE,
  ESTATEWEB_SITES_UPDATE_QUEUE,
  GEOCODE_MISSING_COORDINATES_QUEUE,
  MIGRATE_INTEGRATION_IMAGES_QUEUE,
  PUSH_TO_CMS_QUEUE,
  RENORMALIZATION_QUEUE,
  RESOLVE_ESTATEWEB_LOCATION_QUEUE,
  SALES_PRICE_UPDATE_QUEUE,
  WATERMARK_REMOVAL_QUEUE,
} from '@/core/queues/queues.constants';
import { DewatermarkModule } from '@/integrations/dewatermark/dewatermark.module';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { GcsIntegrationModule } from '@/integrations/storage/gcs/gcs.module';
import { GoogleMapsModule } from '@/shared/services/google-maps/google-maps.module';
import { CmsSyncModule } from '@/modules/cms-sync/cms-sync.module';
import { ContentPublishingModule } from '@/modules/content-publishing/content-publishing.module';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { CostLogsModule } from '@/modules/cost-logs/cost-logs.module';
import { ContentProductionProcessor } from '@/background/content-production.processor';
import { WatermarkRemovalProcessor } from '@/background/watermark-removal.processor';
import { SalesPriceUpdateProcessor } from '@/background/sales-price-update.processor';
import { PushToCmsProcessor } from '@/background/push-to-cms.processor';
import { CrmClientNotesSyncProcessor } from '@/background/crm-client-notes-sync.processor';
import { EstateWebSitesUpdateProcessor } from '@/background/estateweb-sites-update.processor';
import { DeleteIntegrationImagesProcessor } from '@/background/delete-integration-images.processor';
import { MigrateIntegrationImagesProcessor } from '@/background/migrate-integration-images.processor';
import { GeocodeCoordinatesProcessor } from '@/background/geocode-coordinates.processor';
import { ResolveEstateWebLocationProcessor } from '@/background/resolve-estateweb-location.processor';
import { UserPropertiesController } from './user-properties.controller';
import { AdminUserPropertiesController } from './admin-user-properties.controller';
import { UserPropertiesService } from './user-properties.service';
import { ContentProductionJobService } from './services/content-production-job.service';
import { WatermarkRemovalService } from './services/watermark-removal.service';
import { SalesPriceUpdateJobService } from './services/sales-price-update-job.service';
import { PushToCmsJobService } from './services/push-to-cms-job.service';
import { CrmClientNotesSyncJobService } from './services/crm-client-notes-sync-job.service';
import { EstateWebSitesUpdateJobService } from './services/estateweb-sites-update-job.service';
import { DeleteIntegrationImagesJobService } from './services/delete-integration-images-job.service';
import { MigrateIntegrationImagesJobService } from './services/migrate-integration-images-job.service';
import { GeocodeCoordinatesJobService } from './services/geocode-coordinates-job.service';
import { ResolveEstateWebLocationJobService } from './services/resolve-estateweb-location-job.service';

@Module({
  imports: [
    PrismaModule,
    CmsSyncModule,
    ContentPublishingModule,
    EstateWebModule,
    DewatermarkModule,
    GcsIntegrationModule,
    PlatformConfigModule,
    CostLogsModule,
    GoogleMapsModule,
    BullModule.registerQueue(
      { name: WATERMARK_REMOVAL_QUEUE },
      { name: CONTENT_PRODUCTION_QUEUE },
      { name: SALES_PRICE_UPDATE_QUEUE },
      { name: PUSH_TO_CMS_QUEUE },
      { name: CRM_CLIENT_NOTES_SYNC_QUEUE },
      { name: ESTATEWEB_SITES_UPDATE_QUEUE },
      { name: RENORMALIZATION_QUEUE },
      { name: DELETE_INTEGRATION_IMAGES_QUEUE },
      { name: MIGRATE_INTEGRATION_IMAGES_QUEUE },
      { name: GEOCODE_MISSING_COORDINATES_QUEUE },
      { name: RESOLVE_ESTATEWEB_LOCATION_QUEUE },
    ),
  ],
  controllers: [UserPropertiesController, AdminUserPropertiesController],
  providers: [
    UserPropertiesService,
    WatermarkRemovalService,
    WatermarkRemovalProcessor,
    ContentProductionJobService,
    ContentProductionProcessor,
    SalesPriceUpdateJobService,
    SalesPriceUpdateProcessor,
    PushToCmsJobService,
    PushToCmsProcessor,
    CrmClientNotesSyncJobService,
    CrmClientNotesSyncProcessor,
    EstateWebSitesUpdateJobService,
    EstateWebSitesUpdateProcessor,
    DeleteIntegrationImagesJobService,
    DeleteIntegrationImagesProcessor,
    MigrateIntegrationImagesJobService,
    MigrateIntegrationImagesProcessor,
    GeocodeCoordinatesJobService,
    GeocodeCoordinatesProcessor,
    ResolveEstateWebLocationJobService,
    ResolveEstateWebLocationProcessor,
  ],
  exports: [UserPropertiesService],
})
export class UserPropertiesModule {}
