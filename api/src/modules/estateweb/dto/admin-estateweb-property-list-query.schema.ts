import { z } from 'zod';

export const AdminEstateWebPropertyListQuerySchema = z.object({
  code: z.string().optional(),
  scope_id: z.coerce.number().int().optional(),
  client_id: z.coerce.number().int().optional(),
  sqm_from: z.coerce.number().optional(),
  sqm_to: z.coerce.number().optional(),
  price_from: z.coerce.number().optional(),
  price_to: z.coerce.number().optional(),
  address: z.string().optional(),
  is_exclusive_order: z.coerce.number().int().optional(),
  is_offer: z.coerce.number().int().optional(),
  status_id: z.coerce.number().int().optional(),
  types: z.string().optional(),
  locations: z.string().optional(),
  site_id: z.coerce.number().int().optional(),
  gateway_id: z.coerce.number().int().optional(),
  agent_scope: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).optional(),
  rpp: z.coerce.number().int().min(1).max(200).optional(),
  sort_col: z.string().optional(),
  sort_way: z.enum(['ASC', 'DESC']).optional(),
});

export type AdminEstateWebPropertyListQueryType = z.infer<
  typeof AdminEstateWebPropertyListQuerySchema
>;
