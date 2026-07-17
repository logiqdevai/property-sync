import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlatformConfigController],
  providers: [PlatformConfigService],
  exports: [PlatformConfigService],
})
export class PlatformConfigModule {}
