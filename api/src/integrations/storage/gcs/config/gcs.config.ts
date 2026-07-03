import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { GcsConfig as GcsConfigInterface } from '../interfaces/gcs.interfaces';

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
    ): object | undefined {
        if (credentialsJsonBase64) {
            const decoded = Buffer.from(credentialsJsonBase64, 'base64').toString('utf-8');
            return JSON.parse(decoded);
        }

        if (credentialsJson) {
            return JSON.parse(credentialsJson);
        }

        return undefined;
    }

    private initGcs() {
        try {
            const projectId = this.configService.get('GCS_PROJECT_ID');
            const bucketName = this.configService.get('GCS_BUCKET_NAME');
            const credentialsJsonBase64 = this.configService.get('GCS_CREDENTIALS_JSON_BASE64');
            const credentialsJson = this.configService.get('GCS_CREDENTIALS');
            const folderName = this.configService.get('GCS_FOLDER_NAME');

            if (!projectId || !bucketName) {
                this.logger.error('GCS_PROJECT_ID and GCS_BUCKET_NAME are required');
                return;
            }

            const credentials = this.parseCredentials(credentialsJsonBase64, credentialsJson);

            this.config = {
                project_id: projectId,
                bucket_name: bucketName,
                credentials,
                folder_name: folderName || 'documents',
            };

            const storageOptions: { projectId: string; credentials?: object } = {
                projectId: this.config.project_id,
            };

            if (this.config.credentials) {
                storageOptions.credentials = this.config.credentials;
            }

            this.storageClient = new Storage(storageOptions);
            this.logger.debug('Google Cloud Storage initialized');
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
