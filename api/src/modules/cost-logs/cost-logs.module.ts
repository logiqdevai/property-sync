import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CostLogsController } from './cost-logs.controller';
import { UserCostLogsController } from './user-cost-logs.controller';
import { CostLogsService } from './cost-logs.service';

@Module({
  imports: [PrismaModule],
  controllers: [CostLogsController, UserCostLogsController],
  providers: [CostLogsService],
  exports: [CostLogsService],
})
export class CostLogsModule {}
