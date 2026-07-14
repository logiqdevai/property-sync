import { HttpStatus } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';
import { EstateWebException } from '../exceptions/estateweb.exception';
import {
  EstateWebCreatePropertyPayload,
  EstateWebPropertyListQuery,
  EstateWebUploadImagePayload,
} from '../interfaces/estateweb-property.interface';

export function assertValidPropertyId(
  propertyId: number | string | undefined | null,
): asserts propertyId is number | string {
  if (
    propertyId === undefined ||
    propertyId === null ||
    propertyId === '' ||
    Number(propertyId) <= 0
  ) {
    throw new EstateWebException(
      'EstateWeb property id is required',
      NotificationType.ESTATEWEB_INVALID_PROPERTY_ID,
      HttpStatus.BAD_REQUEST,
      { propertyId },
    );
  }
}

export function assertValidCreatePayload(
  payload: EstateWebCreatePropertyPayload,
): void {
  if (!payload.type_id || !payload.scope_id || !payload.location_id) {
    throw new EstateWebException(
      'EstateWeb create property requires type_id, scope_id, and location_id',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      {
        type_id: payload.type_id,
        scope_id: payload.scope_id,
        location_id: payload.location_id,
      },
    );
  }
}

export function assertValidListQuery(query: EstateWebPropertyListQuery): void {
  if (query.page !== undefined && query.page < 1) {
    throw new EstateWebException(
      'EstateWeb list properties page must be >= 1',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      { page: query.page },
    );
  }

  if (query.rpp !== undefined && (query.rpp < 1 || query.rpp > 200)) {
    throw new EstateWebException(
      'EstateWeb list properties rpp must be between 1 and 200',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      { rpp: query.rpp },
    );
  }
}

export function assertValidImageUpload(
  image: Buffer,
  payload: EstateWebUploadImagePayload,
): void {
  if (!image?.length) {
    throw new EstateWebException(
      'EstateWeb image upload requires a non-empty image buffer',
      NotificationType.ESTATEWEB_EMPTY_IMAGE,
      HttpStatus.BAD_REQUEST,
    );
  }

  if (!payload.filename?.trim()) {
    throw new EstateWebException(
      'EstateWeb image upload requires a filename',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export function assertCreatePropertyResponse(
  response: unknown,
): asserts response is { id: number } {
  if (
    !response ||
    typeof response !== 'object' ||
    !('id' in response) ||
    typeof (response as { id: unknown }).id !== 'number' ||
    (response as { id: number }).id <= 0
  ) {
    throw new EstateWebException(
      'EstateWeb create property returned an invalid response (missing id)',
      NotificationType.ESTATEWEB_MISSING_PROPERTY_ID,
      HttpStatus.BAD_GATEWAY,
      { response },
    );
  }
}
