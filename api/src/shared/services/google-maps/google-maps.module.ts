import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CostLogsModule } from '@/modules/cost-logs/cost-logs.module';
import { PlatformConfigModule } from '@/modules/platform-config/platform-config.module';
import { GoogleMapsService } from './google-maps.service';

@Module({
    imports: [PrismaModule, CostLogsModule, PlatformConfigModule],
    providers: [GoogleMapsService],
    exports: [GoogleMapsService],
})
export class GoogleMapsModule { }
