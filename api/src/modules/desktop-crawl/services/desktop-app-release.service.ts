import { Injectable, NotFoundException } from '@nestjs/common';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { GcsFolders } from '@/shared/config/gcs-folders';
import {
  DESKTOP_APP_DOWNLOAD_LINK_MINUTES,
  DESKTOP_APP_MANIFEST_FILE,
} from '../constants/desktop-crawl.constants';
import type {
  DesktopAppManifest,
  DesktopAppRelease,
} from '../interfaces/desktop-crawl.interfaces';

/**
 * The latest published installer of the desktop crawler app. Releases are uploaded to the
 * storage bucket by scripts/publish-desktop-crawler.ts, which also rewrites `latest.json`; this
 * only reads that manifest and signs a short-lived download link, so the installer itself never
 * passes through the API.
 */
@Injectable()
export class DesktopAppReleaseService {
  constructor(private readonly gcsService: GcsService) {}

  async getLatest(): Promise<DesktopAppRelease> {
    let manifest: DesktopAppManifest;
    try {
      const { buffer } = await this.gcsService.downloadImage({
        folder: GcsFolders.desktopCrawler,
        filename: DESKTOP_APP_MANIFEST_FILE,
      });
      manifest = JSON.parse(buffer.toString('utf8')) as DesktopAppManifest;
    } catch {
      throw new NotFoundException(
        'No version of the desktop crawler app has been published yet.',
      );
    }

    const download_url = await this.gcsService.getSignedUrlForPath(
      `${GcsFolders.desktopCrawler}/${manifest.file_name}`,
      DESKTOP_APP_DOWNLOAD_LINK_MINUTES,
    );
    return { ...manifest, download_url };
  }
}
