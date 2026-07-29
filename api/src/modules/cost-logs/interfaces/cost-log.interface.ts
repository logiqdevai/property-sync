import { CostOperationType, IntegrationType } from 'generated/prisma';

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface RecordCostLogParams {
  userId?: string | null;
  operationType: CostOperationType;
  provider: IntegrationType;
  model?: string | null;
  inputQuantity?: number | null;
  outputQuantity?: number | null;
  unitCount?: number | null;
  inputCost?: number | null;
  outputCost?: number | null;
  totalCost: number;
  crawlRunId?: string | null;
  userPropertyId?: string | null;
  userTrackedAgencyId?: string | null;
  aiBatchRunId?: string | null;
  metadata?: Record<string, unknown> | null;
}
