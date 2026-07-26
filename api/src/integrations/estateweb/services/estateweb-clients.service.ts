import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';
import { EstateWebConfig } from '../config/estateweb.config';
import { EstateWebException } from '../exceptions/estateweb.exception';
import { EstateWebCrmClient } from '../interfaces/estateweb-crm-client.interface';
import { EstateWebClientService } from './estateweb-client.service';
import { EstateWebIntegrationResolverService } from './estateweb-integration-resolver.service';
import { EstateWebNotificationService } from './estateweb-notification.service';

@Injectable()
export class EstateWebClientsService {
  constructor(
    private readonly estateWebClientService: EstateWebClientService,
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebNotificationService: EstateWebNotificationService,
    private readonly estateWebIntegrationResolverService: EstateWebIntegrationResolverService,
  ) {}

  getClient(
    userIntegrationId: string,
    clientId: number | string,
  ): Promise<EstateWebCrmClient> {
    return this.runValidatedOperation(userIntegrationId, 'get-client', () => {
      this.assertValidClientId(clientId);

      return this.estateWebClientService.request<EstateWebCrmClient>(
        userIntegrationId,
        {
          method: 'GET',
          path: this.estateWebConfig.getConfig().apiPaths.clientById(clientId),
          operation: 'get-client',
        },
      );
    });
  }

  async getClientForUser(
    userId: string,
    clientId: number | string,
  ): Promise<EstateWebCrmClient> {
    const { userIntegrationId } =
      await this.estateWebIntegrationResolverService.resolveDefaultForUser(
        userId,
      );

    return this.getClient(userIntegrationId, clientId);
  }

  private assertValidClientId(
    clientId: number | string | undefined | null,
  ): asserts clientId is number | string {
    if (
      clientId === undefined ||
      clientId === null ||
      clientId === '' ||
      Number(clientId) <= 0
    ) {
      throw new EstateWebException(
        'EstateWeb client id is required',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
        { clientId },
      );
    }
  }

  private async runValidatedOperation<T>(
    userIntegrationId: string,
    operation: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (
        error instanceof EstateWebException &&
        error.code === NotificationType.ESTATEWEB_VALIDATION_FAILED
      ) {
        this.estateWebNotificationService.captureError(
          {
            userIntegrationId,
            operation,
            notificationType: error.code,
          },
          error,
        );
      }
      throw error;
    }
  }
}
