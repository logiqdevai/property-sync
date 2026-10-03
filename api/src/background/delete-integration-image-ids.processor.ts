import { Processor } from '@nestjs/bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { DELETE_INTEGRATION_IMAGE_IDS_QUEUE } from '@/core/queues/queues.constants';
import { DeleteIntegrationImagesJobService } from '@/modules/user-properties/services/delete-integration-images-job.service';
import { DeleteIntegrationImagesProcessor } from './delete-integration-images.processor';

// Single-image deletes run on their own queue: workers that predate the image_ids
// branch would treat those jobs as delete-all on the shared delete queue.
@Processor(DELETE_INTEGRATION_IMAGE_IDS_QUEUE, { concurrency: 5 })
export class DeleteIntegrationImageIdsProcessor extends DeleteIntegrationImagesProcessor {
  constructor(
    prisma: PrismaService,
    deleteIntegrationImagesJobService: DeleteIntegrationImagesJobService,
  ) {
    super(prisma, deleteIntegrationImagesJobService);
  }
}
