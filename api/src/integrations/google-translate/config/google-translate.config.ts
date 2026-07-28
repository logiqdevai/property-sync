import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 } from '@google-cloud/translate';
import { JWTInput } from 'google-auth-library';
import { GoogleTranslateException } from '../exceptions/google-translate.exception';
import { GoogleTranslateClientConfig } from '../interfaces/google-translate.interfaces';

@Injectable()
export class GoogleTranslateConfig {
  private readonly logger = new Logger(GoogleTranslateConfig.name);
  private client: v2.Translate | null = null;
  private config: GoogleTranslateClientConfig | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initClient();
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

  private initClient() {
    try {
      const projectId = this.configService.get<string>('GCS_PROJECT_ID');
      const credentialsJsonBase64 = this.configService.get<string>(
        'GCS_CREDENTIALS_JSON_BASE64',
      );
      const credentialsJson =
        this.configService.get<string>('GCS_CREDENTIALS');

      const credentials = this.parseCredentials(
        credentialsJsonBase64,
        credentialsJson,
      );

      if (!projectId || !credentials) {
        this.logger.warn(
          'Google Translate not configured (requires GCS_PROJECT_ID and GCS credentials)',
        );
        return;
      }

      this.config = {
        project_id: projectId,
        credentials,
      };

      this.client = new v2.Translate({
        projectId,
        credentials,
        autoRetry: true,
        maxRetries: 3,
      });

      this.logger.log(
        `Google Translate initialized (project=${projectId}, auth=service_account)`,
      );
    } catch (error) {
      this.logger.error('Error initializing Google Translate', error);
      this.client = null;
      this.config = null;
    }
  }

  getClient(): v2.Translate {
    if (!this.client) {
      throw new GoogleTranslateException(
        'Google Translate is not configured',
        'GOOGLE_TRANSLATE_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.client;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getConfig(): GoogleTranslateClientConfig | null {
    return this.config;
  }
}
