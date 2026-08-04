import { HttpStatus } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';
import {
  ESTATEWEB_INIT_LANGUAGES,
  EstateWebFieldType,
  EstateWebScope,
} from '../constants/estateweb-enums.constants';
import { EstateWebException } from '../exceptions/estateweb.exception';
import {
  EstateWebCreatePropertyPayload,
  EstateWebPropertyAd,
  EstateWebPropertyListQuery,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
} from '../interfaces/estateweb-property.interface';
import {
  getEstateWebInitField,
  getEstateWebInitFieldOption,
  getEstateWebInitFieldsForType,
  getEstateWebInitPropertyType,
} from './estateweb-init-lookup.util';

const ALLOWED_LANGUAGE_IDS = new Set<number>(
  ESTATEWEB_INIT_LANGUAGES.map((lang) => lang.id),
);
const ALLOWED_SCOPE_IDS = new Set<number>([
  EstateWebScope.SALE,
  EstateWebScope.RENT,
]);

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

export function assertValidPropertyNote(
  note: string | undefined | null,
): asserts note is string {
  if (typeof note !== 'string' || !note.trim()) {
    throw new EstateWebException(
      'EstateWeb property note is required',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      { note },
    );
  }
}

function assertValidPropertyTypeId(typeId: number): void {
  const type = getEstateWebInitPropertyType(typeId);
  if (!type) {
    throw new EstateWebException(
      'EstateWeb property type_id is not a known init property type',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      { type_id: typeId, expected_leaf: true },
    );
  }
  if (type.children.length > 0) {
    throw new EstateWebException(
      'EstateWeb property type_id must be a leaf node (has children)',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      {
        type_id: typeId,
        expected_leaf: true,
        available_leaf_ids: type.children.map((c) => c.id),
      },
    );
  }
}

function assertValidScope(scopeId: number): void {
  if (!ALLOWED_SCOPE_IDS.has(scopeId)) {
    throw new EstateWebException(
      'EstateWeb scope_id must be 1 (SALE) or 2 (RENT)',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      { scope_id: scopeId, allowed: Array.from(ALLOWED_SCOPE_IDS) },
    );
  }
}

function isIntegerString(value: string): boolean {
  return /^-?\d+$/.test(value.trim());
}

function assertValidFieldValueShape(
  fieldId: number,
  fieldTypeId: number,
  fieldName: string,
  value: unknown,
): void {
  switch (fieldTypeId) {
    case EstateWebFieldType.NUMERIC: {
      if (typeof value === 'number') {
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
          throw new EstateWebException(
            'EstateWeb NUMERIC field value must be an integer',
            NotificationType.ESTATEWEB_VALIDATION_FAILED,
            HttpStatus.BAD_REQUEST,
            { field_id: fieldId, name: fieldName, value },
          );
        }
        return;
      }
      if (typeof value === 'string' && isIntegerString(value)) return;
      throw new EstateWebException(
        'EstateWeb NUMERIC field value must be an integer string',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
        { field_id: fieldId, name: fieldName, value },
      );
    }
    case EstateWebFieldType.SELECT: {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new EstateWebException(
          'EstateWeb SELECT field value must be a numeric option id',
          NotificationType.ESTATEWEB_VALIDATION_FAILED,
          HttpStatus.BAD_REQUEST,
          { field_id: fieldId, name: fieldName, value },
        );
      }
      const opt = getEstateWebInitFieldOption(fieldId, value);
      if (!opt) {
        throw new EstateWebException(
          'EstateWeb SELECT field value is not a valid option id for this field',
          NotificationType.ESTATEWEB_VALIDATION_FAILED,
          HttpStatus.BAD_REQUEST,
          { field_id: fieldId, name: fieldName, value },
        );
      }
      return;
    }
    case EstateWebFieldType.BOOLEAN: {
      if (value === '1') return;
      throw new EstateWebException(
        'EstateWeb BOOLEAN field value must be the string "1"; omit the field entry to represent false',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
        { field_id: fieldId, name: fieldName, value },
      );
    }
    case EstateWebFieldType.TEXT: {
      if (typeof value !== 'string' || value.length === 0) {
        throw new EstateWebException(
          'EstateWeb TEXT field value must be a non-empty string',
          NotificationType.ESTATEWEB_VALIDATION_FAILED,
          HttpStatus.BAD_REQUEST,
          { field_id: fieldId, name: fieldName, value },
        );
      }
      return;
    }
    default:
      throw new EstateWebException(
        'EstateWeb field has an unknown data type_id',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
        { field_id: fieldId, name: fieldName, type_id: fieldTypeId },
      );
  }
}

function assertValidPayloadFields(
  payload: EstateWebCreatePropertyPayload | EstateWebUpdatePropertyPayload,
): void {
  if (!payload.fields?.length) return;

  const allowedFields = getEstateWebInitFieldsForType(payload.type_id);
  const allowedFieldIds = new Set(allowedFields.map((field) => field.id));

  for (const entry of payload.fields) {
    const field = getEstateWebInitField(entry.id);
    if (!field) {
      throw new EstateWebException(
        'EstateWeb field id is not a known init field',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
        { field_id: entry.id },
      );
    }

    if (!allowedFieldIds.has(entry.id)) {
      throw new EstateWebException(
        'EstateWeb field id is not valid for the given type_id',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
        {
          field_id: entry.id,
          name: field.name,
          type_id: payload.type_id,
        },
      );
    }

    assertValidFieldValueShape(
      field.id,
      field.type_id,
      field.name,
      entry.value,
    );
  }
}

function assertValidAds(ads: EstateWebPropertyAd[] | undefined): void {
  if (!ads?.length) return;
  for (const ad of ads) {
    if (!ALLOWED_LANGUAGE_IDS.has(ad.lang_id)) {
      throw new EstateWebException(
        'EstateWeb ad lang_id is not a known EstateWeb language',
        NotificationType.ESTATEWEB_VALIDATION_FAILED,
        HttpStatus.BAD_REQUEST,
        {
          lang_id: ad.lang_id,
          allowed: Array.from(ALLOWED_LANGUAGE_IDS),
        },
      );
    }
  }
}

function assertValidCorePayload(
  payload: EstateWebCreatePropertyPayload | EstateWebUpdatePropertyPayload,
): void {
  if (!payload.type_id || !payload.scope_id || !payload.location_id) {
    throw new EstateWebException(
      'EstateWeb property requires type_id, scope_id, and location_id',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      {
        type_id: payload.type_id,
        scope_id: payload.scope_id,
        location_id: payload.location_id,
      },
    );
  }

  assertValidPropertyTypeId(payload.type_id);
  assertValidScope(payload.scope_id);
  assertValidPayloadFields(payload);
  assertValidAds(payload.ads);
}

export function assertValidCreatePayload(
  payload: EstateWebCreatePropertyPayload,
): void {
  assertValidCorePayload(payload);
}

export function assertValidUpdatePayload(
  payload: EstateWebUpdatePropertyPayload,
): void {
  assertValidCorePayload(payload);

  if (!payload.id || payload.id <= 0) {
    throw new EstateWebException(
      'EstateWeb update property requires a positive id',
      NotificationType.ESTATEWEB_VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      { id: payload.id },
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
