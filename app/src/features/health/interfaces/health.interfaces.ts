export type HealthIndicatorStatus = "up" | "down";

export interface HealthIndicatorDetail {
  status: HealthIndicatorStatus;
  message?: string;
  uptime_seconds?: number;
  [key: string]: unknown;
}

export interface HealthCheckResponse {
  status: "ok" | "error";
  info: Record<string, HealthIndicatorDetail>;
  error: Record<string, HealthIndicatorDetail>;
  details: Record<string, HealthIndicatorDetail>;
}

export const HealthCheckKeys = {
  API: "api",
  DATABASE: "database",
  REDIS: "redis",
} as const;

export type HealthCheckKey = (typeof HealthCheckKeys)[keyof typeof HealthCheckKeys];
