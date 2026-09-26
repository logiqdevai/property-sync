import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CostLogsController } from './cost-logs.controller';
import { UserCostLogsController } from './user-cost-logs.controller';
import { CostLogsService } from './cost-logs.service';
import { WebshareUsageService } from './services/webshare-usage.service';
import { WebshareModule } from '@/integrations/webshare/webshare.module';

@Module({
  imports: [PrismaModule, WebshareModule],
  controllers: [CostLogsController, UserCostLogsController],
  providers: [CostLogsService, WebshareUsageService],
  exports: [CostLogsService, WebshareUsageService],
})
export class CostLogsModule {}
