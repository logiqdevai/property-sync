import { Prisma, PropertyHistoryEventType } from 'generated/prisma';

export const PropertyChangeFilters = {
  NEW: 'new',
  UPDATED: 'updated',
} as const;

export type PropertyChangeFilter =
  (typeof PropertyChangeFilters)[keyof typeof PropertyChangeFilters];

export const UPDATE_EVENT_TYPES: PropertyHistoryEventType[] = [
  PropertyHistoryEventType.UPDATED,
  PropertyHistoryEventType.PRICE_CHANGED,
  PropertyHistoryEventType.IMAGE_ADDED,
  PropertyHistoryEventType.IMAGE_REMOVED,
];

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

  return {
    some: {
      event_type: { in: UPDATE_EVENT_TYPES },
      ...(createdAt && { created_at: createdAt }),
    },
  };
}
