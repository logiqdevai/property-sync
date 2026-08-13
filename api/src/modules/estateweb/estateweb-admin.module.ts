import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { ESTATEWEB_BULK_SITES_BY_CODES_QUEUE } from '@/core/queues/queues.constants';
import { EstateWebBulkSitesByCodesProcessor } from '@/background/estateweb-bulk-sites-by-codes.processor';
import { AdminEstateWebPropertiesController } from './admin-estateweb-properties.controller';
import { AdminEstateWebPropertiesService } from './admin-estateweb-properties.service';
import { EstateWebCatalogController } from './estateweb-catalog.controller';
import { EstateWebBulkSitesByCodesJobService } from './services/estateweb-bulk-sites-by-codes-job.service';

@Module({
  imports: [
    PrismaModule,
    EstateWebModule,
    BullModule.registerQueue({ name: ESTATEWEB_BULK_SITES_BY_CODES_QUEUE }),
  ],
  controllers: [AdminEstateWebPropertiesController, EstateWebCatalogController],
  providers: [
    AdminEstateWebPropertiesService,
    EstateWebBulkSitesByCodesJobService,
    EstateWebBulkSitesByCodesProcessor,
  ],
})
export class EstateWebAdminModule {}
