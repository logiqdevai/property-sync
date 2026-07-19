import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { GcsIntegrationModule } from '@/integrations/storage/gcs/gcs.module';
import { SourcePropertiesController } from './source-properties.controller';
import { SourcePropertiesService } from './source-properties.service';

@Module({
  imports: [PrismaModule, GcsIntegrationModule],
  controllers: [SourcePropertiesController],
  providers: [SourcePropertiesService],
})
export class SourcePropertiesModule {}
