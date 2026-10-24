import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';
import { EstateWebConfig } from '../config/estateweb.config';
import { EstateWebException } from '../exceptions/estateweb.exception';
import {
  EstateWebClientListResponse,
  EstateWebClientSearchParams,
  EstateWebCrmClient,
} from '../interfaces/estateweb-crm-client.interface';
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

  /**
   * Client search (`GET /api/client?...`) is only available to the user's
   * default EstateWeb integration account, so it never takes an arbitrary
   * integration id.
   */
  async searchClientsForUser(
    userId: string,
    params: EstateWebClientSearchParams = {},
  ): Promise<EstateWebClientListResponse> {
    const { userIntegrationId } =
      await this.estateWebIntegrationResolverService.resolveDefaultForUser(
        userId,
      );

    return this.runValidatedOperation(
      userIntegrationId,
      'search-clients',
      () =>
        this.estateWebClientService.request<EstateWebClientListResponse>(
          userIntegrationId,
          {
            method: 'GET',
            path: this.estateWebConfig.getConfig().apiPaths.clients,
            query: {
              rpp: params.rpp ?? 50,
              page: params.page ?? 1,
              sort_col: params.sortCol ?? 'last_name',
              sort_way: params.sortWay ?? 'ASC',
              type: 0,
              // EstateWeb answers HTTP 500 when empty filter params are sent, so only
              // include the filters that have a value.
              ...(params.lastName && { last_name: params.lastName }),
              ...(params.firstName && { first_name: params.firstName }),
              ...(params.fatherName && { father_name: params.fatherName }),
              ...(params.phone && { phone: params.phone }),
              ...(params.email && { email: params.email }),
              ...(params.occupation && { occupation: params.occupation }),
            },
            operation: 'search-clients',
          },
        ),
    );
  }

  async resolvePropertyNoteFromClient(
    userId: string | undefined,
    integrationClientId: number | null | undefined,
  ): Promise<string | undefined> {
    if (!userId || !integrationClientId) {
      return undefined;
    }

    const client = await this.getClientForUser(userId, integrationClientId);
    const lastName = client.last_name?.trim();
    return lastName || undefined;
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
