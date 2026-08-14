import { Prisma, PropertyHistoryEventType } from 'generated/prisma';

export const PropertyChangeFilters = {
  NEW: 'new',
  UPDATED: 'updated',
  PRICE_CHANGED: 'price_changed',
  IMAGES_CHANGED: 'images_changed',
  FIELDS_UPDATED: 'fields_updated',
  STATUS_CHANGED: 'status_changed',
  REMOVED: 'removed',
  REAPPEARED: 'reappeared',
} as const;

export type PropertyChangeFilter =
  (typeof PropertyChangeFilters)[keyof typeof PropertyChangeFilters];

export const PROPERTY_CHANGE_FILTER_VALUES = Object.values(
  PropertyChangeFilters,
) as [PropertyChangeFilter, ...PropertyChangeFilter[]];

export const UPDATE_EVENT_TYPES: PropertyHistoryEventType[] = [
  PropertyHistoryEventType.UPDATED,
  PropertyHistoryEventType.PRICE_CHANGED,
  PropertyHistoryEventType.IMAGE_ADDED,
  PropertyHistoryEventType.IMAGE_REMOVED,
];

const IMAGE_EVENT_TYPES: PropertyHistoryEventType[] = [
  PropertyHistoryEventType.IMAGE_ADDED,
  PropertyHistoryEventType.IMAGE_REMOVED,
];

function eventTypeForChange(
  change: PropertyChangeFilter,
): PropertyHistoryEventType | PropertyHistoryEventType[] | undefined {
  switch (change) {
    case PropertyChangeFilters.UPDATED:
      return UPDATE_EVENT_TYPES;
    case PropertyChangeFilters.PRICE_CHANGED:
      return PropertyHistoryEventType.PRICE_CHANGED;
    case PropertyChangeFilters.IMAGES_CHANGED:
      return IMAGE_EVENT_TYPES;
    case PropertyChangeFilters.FIELDS_UPDATED:
      return PropertyHistoryEventType.UPDATED;
    case PropertyChangeFilters.STATUS_CHANGED:
      return PropertyHistoryEventType.STATUS_CHANGED;
    case PropertyChangeFilters.REMOVED:
      return PropertyHistoryEventType.REMOVED;
    case PropertyChangeFilters.REAPPEARED:
      return PropertyHistoryEventType.REAPPEARED;
    default:
      return undefined;
  }
}

export function buildHistoryChangeFilter(params: {
  change?: PropertyChangeFilter;
  dateFrom?: Date;
  dateTo?: Date;
}): Prisma.PropertyHistoryListRelationFilter | undefined {
  if (!params.change) {
    return undefined;
  }

  const createdAt =
    params.dateFrom || params.dateTo
      ? {
          ...(params.dateFrom && { gte: params.dateFrom }),
          ...(params.dateTo && { lte: params.dateTo }),
        }
      : undefined;

  if (params.change === PropertyChangeFilters.NEW) {
    if (createdAt) {
      return {
        some: {
          event_type: PropertyHistoryEventType.CREATED,
          created_at: createdAt,
        },
      };
    }

    return {
      some: { event_type: PropertyHistoryEventType.CREATED },
      none: { event_type: { in: UPDATE_EVENT_TYPES } },
    };
  }

  const eventType = eventTypeForChange(params.change);
  if (!eventType) {
    return undefined;
  }

  return {
    some: {
      event_type: Array.isArray(eventType) ? { in: eventType } : eventType,
      ...(createdAt && { created_at: createdAt }),
    },
  };
}
