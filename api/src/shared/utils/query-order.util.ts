import { z } from 'zod';

export const QueryOrderByValues = [
  'created_at',
  'updated_at',
  'price',
] as const;

export type QueryOrderBy = (typeof QueryOrderByValues)[number];

export const QueryOrderDirectionValues = ['asc', 'desc'] as const;

export type QueryOrderDirection = (typeof QueryOrderDirectionValues)[number];

export const queryOrderSchemaFields = {
  order_by: z
    .enum(QueryOrderByValues)
    .optional()
    .default('updated_at'),
  order_direction: z
    .enum(QueryOrderDirectionValues)
    .optional()
    .default('desc'),
};
