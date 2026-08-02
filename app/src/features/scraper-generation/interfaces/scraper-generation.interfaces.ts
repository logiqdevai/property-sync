export const GenerationRunStatuses = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  AWAITING_REVIEW: "AWAITING_REVIEW",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type GenerationRunStatus =
  (typeof GenerationRunStatuses)[keyof typeof GenerationRunStatuses];

export const GenerationTriggers = {
  MANUAL: "MANUAL",
  SELF_HEAL: "SELF_HEAL",
  SCHEDULED: "SCHEDULED",
} as const;

export type GenerationTrigger = (typeof GenerationTriggers)[keyof typeof GenerationTriggers];

export const ComputerActionTypes = {
  CLICK: "CLICK",
  DOUBLE_CLICK: "DOUBLE_CLICK",
  TYPE: "TYPE",
  SCROLL: "SCROLL",
  SCROLL_UP: "SCROLL_UP",
  SCROLL_DOWN: "SCROLL_DOWN",
  NAVIGATE: "NAVIGATE",
  GO_BACK: "GO_BACK",
  CLOSE_TAB: "CLOSE_TAB",
  WAIT: "WAIT",
  KEYPRESS: "KEYPRESS",
  SCREENSHOT: "SCREENSHOT",
  DRAG: "DRAG",
  DONE: "DONE",
} as const;

export type ComputerActionType = (typeof ComputerActionTypes)[keyof typeof ComputerActionTypes];

export interface ComputerUseStep {
  id: string;
  scraper_generation_run_id: string;
  step_index: number;
  action_type: ComputerActionType;
  action_payload: Record<string, unknown>;
  screenshot_before_url: string | null;
  screenshot_after_url: string | null;
  model_reasoning: string | null;
  created_at: string;
}

export interface GenerationRun {
  id: string;
  source_agency_id: string;
  scraper_id: string | null;
  trigger: GenerationTrigger;
  status: GenerationRunStatus;
  prompt: string | null;
  max_steps: number | null;
  staged_config: Record<string, unknown> | null;
  produced_version_id: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
  source_agency?: { name: string };
  scraper?: { name: string } | null;
  steps?: ComputerUseStep[];
}

export interface CreateGenerationRunPayload {
  source_agency_id: string;
  scraper_id?: string;
  prompt?: string;
  max_steps?: number;
}

export interface RejectGenerationRunPayload {
  reason?: string;
}

export interface RetryGenerationRunPayload {
  error?: string;
  prompt?: string;
  max_steps?: number;
}

export interface GenerationRunListQuery {
  page?: number;
  limit?: number;
  status?: GenerationRunStatus;
  trigger?: GenerationTrigger;
  source_agency_id?: string;
  scraper_id?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}
