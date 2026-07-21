import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';
import {
  buildEstateWebAiFieldCatalog,
  buildEstateWebAiPropertyTypeCatalog,
  EstateWebAiFieldEntry,
  EstateWebAiPropertyTypeEntry,
} from '../constants/estateweb-ai-catalog.constants';
import { EstateWebFieldType } from '../constants/estateweb-enums.constants';
import {
  ESTATEWEB_INIT_FIELDS,
  ESTATEWEB_INIT_PROPERTY_TYPES,
  EstateWebInitField,
  EstateWebInitFieldOption,
  EstateWebInitPropertyType,
} from '../constants/estateweb-init.constants';
import { EstateWebConfig } from '../config/estateweb.config';
import { EstateWebException } from '../exceptions/estateweb.exception';
import {
  EstateWebCreatePropertyPayload,
  EstateWebCreatePropertyResponse,
  EstateWebPropertyListItem,
  EstateWebPropertyListQuery,
  EstateWebPropertyListResponse,
  EstateWebPropertyResponse,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
  EstateWebUpdateImagePayload,
} from '../interfaces/estateweb-property.interface';
import {
  getEstateWebFieldOptionName,
  getEstateWebInitField,
  getEstateWebInitFieldOption,
  getEstateWebInitFieldsForType,
  getEstateWebInitPropertyType,
  getEstateWebPropertyTypeNamePath,
  resolveEstateWebFieldByName,
  resolveEstateWebFieldOptionByName,
  resolveEstateWebPropertyTypeByName,
} from '../utils/estateweb-init-lookup.util';
import {
  listEstateWebEnergyClassCatalog,
  listEstateWebFeaturesCatalog,
  listEstateWebFloorCatalog,
  listEstateWebListingTypeCatalog,
  listEstateWebPropertyTypeCatalog,
  listEstateWebRoadTypeCatalog,
} from '../utils/estateweb-catalog.util';
import { listEstateWebLocationCatalog } from '../utils/estateweb-location-lookup.util';
import {
  assertValidCreatePayload,
  assertValidImageUpload,
  assertValidListQuery,
  assertValidPropertyId,
  assertValidUpdatePayload,
} from '../utils/estateweb-property-validation.util';
import { EstateWebClientService } from './estateweb-client.service';
import { EstateWebIntegrationResolverService } from './estateweb-integration-resolver.service';
import { EstateWebNotificationService } from './estateweb-notification.service';

const LIST_ALL_PAGE_SIZE = 200;

@Injectable()
export class EstateWebPropertyService {
  constructor(
    private readonly estateWebClientService: EstateWebClientService,
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebNotificationService: EstateWebNotificationService,
    private readonly estateWebIntegrationResolverService: EstateWebIntegrationResolverService,
  ) {}

  getInitFields(): EstateWebInitField[] {
    return ESTATEWEB_INIT_FIELDS;
  }

  getInitPropertyTypes(): EstateWebInitPropertyType[] {
    return ESTATEWEB_INIT_PROPERTY_TYPES;
  }

  getLocationCatalog() {
    return listEstateWebLocationCatalog();
  }

  getFloorCatalog() {
    return listEstateWebFloorCatalog();
  }

  getEnergyClassCatalog() {
    return listEstateWebEnergyClassCatalog();
  }

  getRoadTypeCatalog() {
    return listEstateWebRoadTypeCatalog();
  }

  getFeaturesCatalog() {
    return listEstateWebFeaturesCatalog();
  }

  getListingTypeCatalog() {
    return listEstateWebListingTypeCatalog();
  }

  getPropertyTypeCatalog() {
    return listEstateWebPropertyTypeCatalog();
  }

  getInitPropertyTypeCatalog() {
    return listEstateWebPropertyTypeCatalog();
  }

  getInitField(fieldId: number): EstateWebInitField | undefined {
    return getEstateWebInitField(fieldId);
  }

  getInitPropertyType(typeId: number): EstateWebInitPropertyType | undefined {
    return getEstateWebInitPropertyType(typeId);
  }

  getInitFieldsForType(typeId: number): EstateWebInitField[] {
    return getEstateWebInitFieldsForType(typeId);
  }

  getInitFieldOption(
    fieldId: number,
    optionId: number,
  ): EstateWebInitFieldOption | undefined {
    return getEstateWebInitFieldOption(fieldId, optionId);
  }

  resolvePropertyTypeByName(
    name: string,
  ): EstateWebInitPropertyType | undefined {
    return resolveEstateWebPropertyTypeByName(name);
  }

  resolveFieldByName(
    name: string,
    opts?: { property_type_id?: number; field_type?: EstateWebFieldType },
  ): EstateWebInitField | undefined {
    return resolveEstateWebFieldByName(name, opts);
  }

  resolveFieldOptionByName(
    fieldId: number,
    name: string,
  ): EstateWebInitFieldOption | undefined {
    return resolveEstateWebFieldOptionByName(fieldId, name);
  }

  getPropertyTypeNamePath(typeId: number): string | undefined {
    return getEstateWebPropertyTypeNamePath(typeId);
  }

  getFieldOptionName(fieldId: number, optionId: number): string | undefined {
    return getEstateWebFieldOptionName(fieldId, optionId);
  }

  getAiFieldCatalog(propertyTypeId?: number): EstateWebAiFieldEntry[] {
    return buildEstateWebAiFieldCatalog(propertyTypeId);
  }

  getAiPropertyTypeCatalog(): EstateWebAiPropertyTypeEntry[] {
    return buildEstateWebAiPropertyTypeCatalog();
  }

  listProperties(
    userIntegrationId: string,
    query: EstateWebPropertyListQuery = {},
  ): Promise<EstateWebPropertyListResponse> {
    return this.runValidatedOperation(
      userIntegrationId,
      'list-properties',
      () => {
        assertValidListQuery(query);

        return this.estateWebClientService.request<EstateWebPropertyListResponse>(
          userIntegrationId,
          {
            method: 'GET',
            path: this.estateWebConfig.getConfig().apiPaths.properties,
            operation: 'list-properties',
            query: this.buildListQuery(query),
          },
        );
      },
    );
  }

  async listAllProperties(
    userId: string,
    query: EstateWebPropertyListQuery = {},
  ): Promise<EstateWebPropertyListResponse> {
    const { userIntegrationId } =
      await this.estateWebIntegrationResolverService.resolveDefaultForUser(
        userId,
      );

    const list: EstateWebPropertyListItem[] = [];
    let page = 1;
    let total = 0;
    let debug: unknown;

    while (true) {
      const response = await this.listProperties(userIntegrationId, {
        ...query,
        page,
        rpp: LIST_ALL_PAGE_SIZE,
      });

      total = response.total;
      if (response.debug !== undefined) {
        debug = response.debug;
      }
      list.push(...response.list);

      if (
        response.list.length === 0 ||
        list.length >= total ||
        response.list.length < LIST_ALL_PAGE_SIZE
      ) {
        break;
      }

      page += 1;
    }

    return {
      total,
      ...(debug !== undefined ? { debug } : {}),
      list,
    };
  }

  createProperty(
    userIntegrationId: string,
    payload: EstateWebCreatePropertyPayload,
  ): Promise<EstateWebCreatePropertyResponse> {
    return this.runValidatedOperation(
      userIntegrationId,
      'create-property',
      () => {
        assertValidCreatePayload(payload);

        const formData =
          this.estateWebClientService.createMultipartPayload(payload);

        return this.estateWebClientService.request<EstateWebCreatePropertyResponse>(
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
        assertValidUpdatePayload(payload);

        if (String(payload.id) !== String(propertyId)) {
          throw new EstateWebException(
            'EstateWeb update property payload id must match route property id',
            NotificationType.ESTATEWEB_VALIDATION_FAILED,
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

  updatePropertyImage(
    userIntegrationId: string,
    imageId: number | string,
    payload: EstateWebUpdateImagePayload,
  ): Promise<unknown> {
    return this.runValidatedOperation(
      userIntegrationId,
      'update-property-image',
      () => {
        assertValidPropertyId(imageId);

        return this.estateWebClientService.request(userIntegrationId, {
          method: 'PATCH',
          path: this.estateWebConfig.getConfig().apiPaths.imageById(imageId),
          operation: 'update-property-image',
          body: payload,
        });
      },
    );
  }

  getProperty(
    userIntegrationId: string,
    propertyId: number | string,
  ): Promise<EstateWebPropertyResponse> {
    return this.runValidatedOperation(userIntegrationId, 'get-property', () => {
      assertValidPropertyId(propertyId);

      return this.estateWebClientService.request<EstateWebPropertyResponse>(
        userIntegrationId,
        {
          method: 'GET',
          path: this.estateWebConfig
            .getConfig()
            .apiPaths.propertyById(propertyId),
          operation: 'get-property',
          propertyId,
        },
      );
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
        (error.code === NotificationType.ESTATEWEB_VALIDATION_FAILED ||
          error.code === NotificationType.ESTATEWEB_INVALID_PROPERTY_ID ||
          error.code === NotificationType.ESTATEWEB_EMPTY_IMAGE)
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
