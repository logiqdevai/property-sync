import * as http from 'http';
import * as https from 'https';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { JWTInput } from 'google-auth-library';
import { GcsConfig as GcsConfigInterface } from '../interfaces/gcs.interfaces';

const httpAgentNoKeepAlive = new http.Agent({ keepAlive: false });
const httpsAgentNoKeepAlive = new https.Agent({ keepAlive: false });

function noKeepAliveAgent(parsedURL: URL): http.Agent | https.Agent {
  return parsedURL.protocol === 'http:'
    ? httpAgentNoKeepAlive
    : httpsAgentNoKeepAlive;
}

@Injectable()
export class GcsConfig {
  private storageClient: Storage;
  private readonly logger = new Logger(GcsConfig.name);
  private config: GcsConfigInterface;

  constructor(private readonly configService: ConfigService) {
    this.initGcs();
  }

  private parseCredentials(
    credentialsJsonBase64?: string,
    credentialsJson?: string,
  ): JWTInput | undefined {
    let parsed: JWTInput | undefined;

    if (credentialsJsonBase64) {
      const decoded = Buffer.from(credentialsJsonBase64, 'base64').toString(
        'utf-8',
      );
      parsed = JSON.parse(decoded) as JWTInput;
    } else if (credentialsJson) {
      parsed = JSON.parse(credentialsJson) as JWTInput;
    }

    if (!parsed) {
      return undefined;
    }

    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }

    return parsed;
  }

  private initGcs() {
    try {
      const projectId = this.configService.get<string>('GCS_PROJECT_ID');
      const bucketName = this.configService.get<string>('GCS_BUCKET_NAME');
      const credentialsJsonBase64 = this.configService.get<string>(
        'GCS_CREDENTIALS_JSON_BASE64',
      );
      const credentialsJson = this.configService.get<string>('GCS_CREDENTIALS');

      if (!projectId || !bucketName) {
        this.logger.error('GCS_PROJECT_ID and GCS_BUCKET_NAME are required');
        return;
      }

      const credentials = this.parseCredentials(
        credentialsJsonBase64,
        credentialsJson,
      );

      this.config = {
        project_id: projectId,
        bucket_name: bucketName,
        credentials,
      };

      this.storageClient = new Storage({
        projectId,
        credentials,
        clientOptions: {
          transporterOptions: {
            agent: noKeepAliveAgent,
          },
        },
      });
      this.logger.log(
        `Google Cloud Storage initialized (project=${projectId}, bucket=${bucketName}, has_credentials=${Boolean(credentials)})`,
      );
    } catch (error) {
      this.logger.error('Error initializing Google Cloud Storage', error);
    }
  }

  getStorageClient(): Storage {
    return this.storageClient;
  }

  getConfig(): GcsConfigInterface {
    return this.config;
  }

  getBucketName(): string {
    return this.config.bucket_name;
  }
}
