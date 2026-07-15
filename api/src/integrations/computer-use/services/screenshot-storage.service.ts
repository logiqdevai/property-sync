import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { GcsFolders } from '@/shared/config/gcs-folders';
import { DocumentType } from 'generated/prisma';
// Document.user_uuid has no FK relation to User; generation-run screenshots aren't tied
// to an end user, so a placeholder is used per docs/plan/tasks/feature-04-ai-generation/02-computer-use-loop-engine.md.
const SCREENSHOT_UPLOADER_PLACEHOLDER = 'scraper-generation';

@Injectable()
export class ScreenshotStorageService {
  constructor(
    private readonly gcsService: GcsService,
    private readonly prisma: PrismaService,
  ) {}

  async store(buffer: Buffer, filename: string): Promise<string> {
    const upload = await this.gcsService.uploadImageFromBuffer(
      buffer,
      filename,
      'image/png',
      GcsFolders.generationRunScreenshots,
    );

    const document = await this.prisma.document.create({
      data: {
        user_uuid: SCREENSHOT_UPLOADER_PLACEHOLDER,
        filename: upload.filename,
        mimetype: 'image/png',
        size: upload.size,
        url: upload.url,
        path: upload.path,
        type: DocumentType.IMAGE,
      },
    });

    return document.id;
  }
}
