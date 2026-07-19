import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { EstateWebModule } from '@/integrations/estateweb/estateweb.module';
import { AdminEstateWebPropertiesController } from './admin-estateweb-properties.controller';
import { AdminEstateWebPropertiesService } from './admin-estateweb-properties.service';
import { EstateWebCatalogController } from './estateweb-catalog.controller';

@Module({
  imports: [PrismaModule, EstateWebModule],
  controllers: [AdminEstateWebPropertiesController, EstateWebCatalogController],
  providers: [AdminEstateWebPropertiesService],
})
export class EstateWebAdminModule {}
