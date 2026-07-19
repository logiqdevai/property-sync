import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/core/databases/prisma/prisma.module';
import { CRAWL_QUEUE, GENERATION_QUEUE } from '@/core/queues/queues.constants';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: GENERATION_QUEUE }, { name: CRAWL_QUEUE }),
  ],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
