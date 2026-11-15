import { Injectable, NotFoundException } from '@nestjs/common';
import type { Readable } from 'stream';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { GcsFolders } from '@/shared/config/gcs-folders';
import {
  DESKTOP_APP_DOWNLOAD_LINK_MINUTES,
  DESKTOP_APP_MANIFEST_FILE,
  DESKTOP_APP_UPDATE_FILE_PATTERN,
} from '../constants/desktop-crawl.constants';
import type {
  DesktopAppManifest,
  DesktopAppRelease,
} from '../interfaces/desktop-crawl.interfaces';

/**
 * The published desktop crawler app. Releases are uploaded to the storage bucket by
 * scripts/publish-desktop-crawler.ts: the installer, electron-builder's `latest.yml` (read by the
 * app's auto-updater) and our own `latest.json` (read by the admin download button).
 */
@Injectable()
export class DesktopAppReleaseService {
  constructor(private readonly gcsService: GcsService) {}

  /** For the admin "Download for Windows" button: version info + a short-lived signed link. */
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

  /**
   * The auto-updater's feed (electron-updater "generic" provider): it fetches `latest.yml`, then
   * the installer named in it. Both are streamed from the private bucket through the API, so the
   * app downloads them with the signed-in user's token and the bucket never has to be public.
   */
  async openUpdateFile(
    fileName: string,
  ): Promise<{ stream: Readable; size: number; contentType: string }> {
    if (!DESKTOP_APP_UPDATE_FILE_PATTERN.test(fileName)) {
      throw new NotFoundException('Update file not found');
    }
    const file = await this.gcsService.openReadStream(
      `${GcsFolders.desktopCrawler}/${fileName}`,
    );
    if (!file) throw new NotFoundException('Update file not found');
    return file;
  }
}
