import { Module, Global } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import {
  AI_BATCH_COMPLETE_QUEUE,
  BULL_BOARD_ADAPTER,
  CRAWL_QUEUE,
} from './queues.constants';

@Global()
@Module({
  imports: [
    BullModule.registerQueue(
      { name: CRAWL_QUEUE },
      { name: AI_BATCH_COMPLETE_QUEUE },
    ),
  ],
  providers: [
    {
      provide: BULL_BOARD_ADAPTER,
      inject: [
        getQueueToken(CRAWL_QUEUE),
        getQueueToken(AI_BATCH_COMPLETE_QUEUE),
      ],
      useFactory: (crawlQueue: Queue, aiBatchCompleteQueue: Queue) => {
        const serverAdapter = new ExpressAdapter();
        serverAdapter.setBasePath('/admin/queues');

        createBullBoard({
          queues: [
            new BullMQAdapter(crawlQueue),
            new BullMQAdapter(aiBatchCompleteQueue),
          ],
          serverAdapter,
        });

        return serverAdapter;
      },
    },
  ],
  exports: [BULL_BOARD_ADAPTER],
})
export class BullBoardModule {}
