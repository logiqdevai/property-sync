export interface WebshareUsage {
  configured: boolean;
  plan?: {
    id: number;
    proxy_type: string;
    proxy_subtype: string;
    monthly_price: number;
  };
  period_start?: string;
  period_end?: string;
  limit_bytes?: number | null;
  used_bytes?: number;
  remaining_bytes?: number | null;
  percent_used?: number | null;
  requests_total?: number;
  requests_failed?: number;
  fetched_at?: string;
}

export interface RecordWebshareUsageParams {
  bytes: number;
  requests?: number;
  userId?: string | null;
  crawlRunId?: string | null;
  userTrackedAgencyId?: string | null;
  metadata?: Record<string, unknown> | null;
}
