import type { PaginatedResponse, PaginationMeta } from "@/features/crawl-runs/interfaces/crawl-runs.interfaces";

export const CostOperationTypes = {
  NORMALIZATION: "NORMALIZATION",
  TITLE_GENERATION: "TITLE_GENERATION",
  TRANSLATION: "TRANSLATION",
  DEWATERMARK: "DEWATERMARK",
  OTHER: "OTHER",
} as const;

export type CostOperationType = (typeof CostOperationTypes)[keyof typeof CostOperationTypes];

export const CostProviders = {
  ESTATEWEB: "ESTATEWEB",
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  GEMINI: "GEMINI",
  DEEPSEEK: "DEEPSEEK",
  DEWATERMARK: "DEWATERMARK",
  GOOGLE_TRANSLATE: "GOOGLE_TRANSLATE",
  AZURE: "AZURE",
} as const;

export type CostProvider = (typeof CostProviders)[keyof typeof CostProviders];

export interface CostLog {
  id: string;
  user_id: string | null;
  operation_type: CostOperationType;
  provider: CostProvider;
  model: string | null;
  input_quantity: number | null;
  output_quantity: number | null;
  unit_count: number | null;
  input_cost: string | null;
  output_cost: string | null;
  total_cost: string;
  currency: string;
  crawl_run_id: string | null;
  user_property_id: string | null;
  user_tracked_agency_id: string | null;
  ai_batch_run_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?: { email: string } | null;
  crawl_run?: { id: string; source_agency_id: string } | null;
  user_property?: { id: string; title: string } | null;
}

export interface CostLogListQuery {
  page?: number;
  limit?: number;
  user_id?: string;
  operation_type?: CostOperationType;
  provider?: CostProvider;
  date_from?: string;
  date_to?: string;
}

export interface CostLogOperationQuantity {
  input_quantity: number;
  output_quantity: number;
  unit_count: number;
}

export interface CostLogListResponse extends PaginatedResponse<CostLog> {
  total_cost: string | null;
  by_operation: Record<string, string>;
  quantity_by_operation: Record<string, CostLogOperationQuantity>;
}

export type { PaginationMeta };
