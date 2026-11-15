/**
 * Publishes a build of the desktop crawler app (desktop/) so admins can download it from
 * App Config in the web app (GET /desktop-crawl/app/latest).
 *
 * Uploads the installer to `<GCS_BUCKET_NAME>/desktop-crawler/<file>` (older versions are kept),
 * then rewrites `desktop-crawler/latest.json` to point at it. Use the env file of the environment
 * whose bucket the deployed API reads.
 *
 *   cd desktop && npm run dist          # builds release/Property-Sync-Crawler-Setup-<version>.exe
 *   cd ../api
 *   npx dotenv -e .env.staging -- node -r ts-node/register scripts/publish-desktop-crawler.ts
 *   ... scripts/publish-desktop-crawler.ts --file=<path to .exe>   # another installer
 *
 * Without --file it takes the installer for the version in desktop/package.json.
 */
import { existsSync, readFileSync, statSync } from 'fs';
import { basename, resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { GcsConfig } from '../src/integrations/storage/gcs/config/gcs.config';

const FOLDER = 'desktop-crawler';
const MANIFEST = 'latest.json';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((a) => a.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main() {
  const desktopDir = resolve(__dirname, '../../desktop');
  const { version } = JSON.parse(
    readFileSync(resolve(desktopDir, 'package.json'), 'utf8'),
  ) as { version: string };
  const file = resolve(
    arg('file') ??
      resolve(desktopDir, `release/Property-Sync-Crawler-Setup-${version}.exe`),
  );
  if (!existsSync(file)) {
    throw new Error(
      `Installer not found: ${file} (run "npm run dist" in desktop/ first)`,
    );
  }

  const gcs = new GcsConfig(new ConfigService(process.env));
  const bucket = gcs.getStorageClient().bucket(gcs.getBucketName());
  const fileName = basename(file);
  const size = statSync(file).size;

  console.log(
    `Uploading ${fileName} (${(size / 1024 / 1024).toFixed(1)} MB) to gs://${bucket.name}/${FOLDER}/ …`,
  );
  await bucket.upload(file, {
    destination: `${FOLDER}/${fileName}`,
    resumable: true,
    metadata: {
      contentType: 'application/vnd.microsoft.portable-executable',
      contentDisposition: `attachment; filename="${fileName}"`,
    },
  });

  const manifest = {
    version: arg('version') ?? version,
    file_name: fileName,
    size_bytes: size,
    published_at: new Date().toISOString(),
  };
  await bucket
    .file(`${FOLDER}/${MANIFEST}`)
    .save(JSON.stringify(manifest, null, 2), {
      contentType: 'application/json',
      resumable: false,
      metadata: { cacheControl: 'no-cache' },
    });
  console.log(`Published version ${manifest.version}:`, manifest);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
