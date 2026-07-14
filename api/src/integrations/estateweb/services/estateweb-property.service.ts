import { HttpStatus, Injectable } from '@nestjs/common';
import { EstateWebErrorCode } from '../constants/estateweb-error-codes';
import { EstateWebConfig } from '../config/estateweb.config';
import { EstateWebException } from '../exceptions/estateweb.exception';
import {
  EstateWebCreatePropertyPayload,
  EstateWebPropertyListQuery,
  EstateWebPropertyResponse,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
} from '../interfaces/estateweb-property.interface';
import {
  assertValidCreatePayload,
  assertValidImageUpload,
  assertValidListQuery,
  assertValidPropertyId,
} from '../utils/estateweb-property-validation.util';
import { EstateWebClientService } from './estateweb-client.service';
import { EstateWebNotificationService } from './estateweb-notification.service';

@Injectable()
export class EstateWebPropertyService {
  constructor(
    private readonly estateWebClientService: EstateWebClientService,
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebNotificationService: EstateWebNotificationService,
  ) {}

  listProperties<T = unknown>(
    userIntegrationId: string,
    query: EstateWebPropertyListQuery = {},
  ): Promise<T> {
    return this.runValidatedOperation(userIntegrationId, 'list-properties', () => {
      assertValidListQuery(query);

      return this.estateWebClientService.request<T>(userIntegrationId, {
        method: 'GET',
        path: this.estateWebConfig.getConfig().apiPaths.properties,
        operation: 'list-properties',
        query: this.buildListQuery(query),
      });
    });
  }

  createProperty(
    userIntegrationId: string,
    payload: EstateWebCreatePropertyPayload,
  ): Promise<EstateWebPropertyResponse> {
    return this.runValidatedOperation(
      userIntegrationId,
      'create-property',
      () => {
        assertValidCreatePayload(payload);

        const formData =
          this.estateWebClientService.createMultipartPayload(payload);

        return this.estateWebClientService.request<EstateWebPropertyResponse>(
          userIntegrationId,
          {
            method: 'POST',
            path: this.estateWebConfig.getConfig().apiPaths.properties,
            operation: 'create-property',
            formData,
            validateCreateResponse: true,
          },
        );
      },
    );
  }

  updateProperty(
    userIntegrationId: string,
    propertyId: number | string,
    payload: EstateWebUpdatePropertyPayload,
  ): Promise<EstateWebPropertyResponse> {
    return this.runValidatedOperation(
      userIntegrationId,
      'update-property',
      () => {
        assertValidPropertyId(propertyId);

        if (payload.id !== undefined && String(payload.id) !== String(propertyId)) {
          throw new EstateWebException(
            'EstateWeb update property payload id must match route property id',
            EstateWebErrorCode.VALIDATION_FAILED,
            HttpStatus.BAD_REQUEST,
            { propertyId, payloadId: payload.id },
          );
        }

        return this.estateWebClientService.request<EstateWebPropertyResponse>(
          userIntegrationId,
          {
            method: 'PATCH',
            path: this.estateWebConfig
              .getConfig()
              .apiPaths.propertyById(propertyId),
            operation: 'update-property',
            propertyId,
            body: payload,
          },
        );
      },
    );
  }

  uploadPropertyImage(
    userIntegrationId: string,
    propertyId: number | string,
    image: Buffer,
    payload: EstateWebUploadImagePayload,
    mimeType: string = 'image/jpeg',
  ): Promise<unknown> {
    return this.runValidatedOperation(
      userIntegrationId,
      'upload-property-image',
      () => {
        assertValidPropertyId(propertyId);
        assertValidImageUpload(image, payload);

        const formData = this.estateWebClientService.createMultipartImageUpload(
          payload,
          image,
          payload.filename,
          mimeType,
        );

        return this.estateWebClientService.request(userIntegrationId, {
          method: 'POST',
          path: this.estateWebConfig
            .getConfig()
            .apiPaths.propertyImage(propertyId),
          operation: 'upload-property-image',
          propertyId,
          formData,
        });
      },
    );
  }

  getProperty<T = EstateWebPropertyResponse>(
    userIntegrationId: string,
    propertyId: number | string,
  ): Promise<T> {
    return this.runValidatedOperation(userIntegrationId, 'get-property', () => {
      assertValidPropertyId(propertyId);

      return this.estateWebClientService.request<T>(userIntegrationId, {
        method: 'GET',
        path: this.estateWebConfig.getConfig().apiPaths.propertyById(propertyId),
        operation: 'get-property',
        propertyId,
      });
    });
  }

  private buildListQuery(
    query: EstateWebPropertyListQuery,
  ): Record<string, string | number | undefined> {
    return {
      code: query.code,
      scope_id: query.scope_id,
      client_id: query.client_id,
      sqm_from: query.sqm_from,
      sqm_to: query.sqm_to,
      price_from: query.price_from,
      price_to: query.price_to,
      address: query.address,
      is_exclusive_order: query.is_exclusive_order,
      is_offer: query.is_offer,
      status_id: query.status_id ?? 0,
      types: query.types,
      locations: query.locations,
      site_id: query.site_id,
      gateway_id: query.gateway_id,
      agent_scope: query.agent_scope ?? 0,
      page: query.page ?? 1,
      rpp: query.rpp ?? 50,
      sort_col: query.sort_col ?? 'created_at',
      sort_way: query.sort_way ?? 'DESC',
    };
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
        (error.code === EstateWebErrorCode.VALIDATION_FAILED ||
          error.code === EstateWebErrorCode.INVALID_PROPERTY_ID ||
          error.code === EstateWebErrorCode.EMPTY_IMAGE)
      ) {
        this.estateWebNotificationService.captureError(
          {
            userIntegrationId,
            operation,
            errorCode: error.code,
          },
          error,
        );
      }
      throw error;
    }
  }
}
