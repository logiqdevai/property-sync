import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Routes } from "@/routes/routes";
import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";
import {
  OrderBy,
  OrderDirection,
  type OrderBy as OrderByType,
  type OrderDirection as OrderDirectionType,
} from "@/interfaces/filters/filters.interface";
import { TablePageSizeOptions } from "@/config/constants/dropdowns/shared/table-page-size.options";

const DEFAULT_LIMIT = 20;
const DEFAULT_PAGE = 1;
const DEFAULT_ORDER_BY = OrderBy.UPDATED_AT;
const DEFAULT_ORDER_DIRECTION = OrderDirection.DESC;

const STATUS_VALUES = new Set<string>(Object.values(PropertyStatuses));
const ORDER_BY_VALUES = new Set<string>(Object.values(OrderBy));
const ORDER_DIRECTION_VALUES = new Set<string>(Object.values(OrderDirection));
const BOOL_FILTER_VALUES = new Set(["true", "false"]);
const LIMIT_VALUES = new Set(TablePageSizeOptions.map((option) => option.value));

export type PropertiesListBoolFilter = "all" | "true" | "false";

export type PropertiesListLocationState = {
  returnTo?: string;
};

export function resolvePropertiesListReturnTo(state: unknown): string {
  const listPath = Routes.dashboard.properties.list;
  if (
    typeof state === "object" &&
    state !== null &&
    "returnTo" in state &&
    typeof (state as PropertiesListLocationState).returnTo === "string"
  ) {
    const returnTo = (state as PropertiesListLocationState).returnTo!;
    if (returnTo === listPath || returnTo.startsWith(`${listPath}?`)) {
      return returnTo;
    }
  }
  return listPath;
}

export type PropertiesListFilters = {
  status: PropertyStatus | "all";
  search: string;
  trackedAgencyId: string | "all";
  duplicateGroup: PropertiesListBoolFilter;
  pushedToCrm: PropertiesListBoolFilter;
  pendingCrmUpdate: PropertiesListBoolFilter;
  dateFrom: string;
  dateTo: string;
  orderBy: OrderByType;
  orderDirection: OrderDirectionType;
  limit: number;
  page: number;
};

type PropertiesListFilterPatch = Partial<PropertiesListFilters>;

function parseStatus(value: string | null): PropertyStatus | "all" {
  if (value && STATUS_VALUES.has(value)) return value as PropertyStatus;
  return "all";
}

function parseBoolFilter(value: string | null): PropertiesListBoolFilter {
  if (value && BOOL_FILTER_VALUES.has(value)) {
    return value as PropertiesListBoolFilter;
  }
  return "all";
}

function parseOrderBy(value: string | null): OrderByType {
  if (value && ORDER_BY_VALUES.has(value)) return value as OrderByType;
  return DEFAULT_ORDER_BY;
}

function parseOrderDirection(value: string | null): OrderDirectionType {
  if (value && ORDER_DIRECTION_VALUES.has(value)) {
    return value as OrderDirectionType;
  }
  return DEFAULT_ORDER_DIRECTION;
}

function parseLimit(value: string | null): number {
  if (value == null || value === "") return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (LIMIT_VALUES.has(parsed)) return parsed;
  return DEFAULT_LIMIT;
}

function parsePage(value: string | null): number {
  if (value == null || value === "") return DEFAULT_PAGE;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  return DEFAULT_PAGE;
}

function parseFilters(searchParams: URLSearchParams): PropertiesListFilters {
  return {
    status: parseStatus(searchParams.get("status")),
    search: searchParams.get("search") ?? "",
    trackedAgencyId: searchParams.get("agency") ?? "all",
    duplicateGroup: parseBoolFilter(searchParams.get("duplicate_group")),
    pushedToCrm: parseBoolFilter(searchParams.get("pushed_to_crm")),
    pendingCrmUpdate: parseBoolFilter(searchParams.get("pending_crm_update")),
    dateFrom: searchParams.get("date_from") ?? "",
    dateTo: searchParams.get("date_to") ?? "",
    orderBy: parseOrderBy(searchParams.get("order_by")),
    orderDirection: parseOrderDirection(searchParams.get("order_direction")),
    limit: parseLimit(searchParams.get("limit")),
    page: parsePage(searchParams.get("page")),
  };
}

function buildSearchParams(filters: PropertiesListFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.trackedAgencyId !== "all") {
    params.set("agency", filters.trackedAgencyId);
  }
  if (filters.duplicateGroup !== "all") {
    params.set("duplicate_group", filters.duplicateGroup);
  }
  if (filters.pushedToCrm !== "all") {
    params.set("pushed_to_crm", filters.pushedToCrm);
  }
  if (filters.pendingCrmUpdate !== "all") {
    params.set("pending_crm_update", filters.pendingCrmUpdate);
  }
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.orderBy !== DEFAULT_ORDER_BY) {
    params.set("order_by", filters.orderBy);
  }
  if (filters.orderDirection !== DEFAULT_ORDER_DIRECTION) {
    params.set("order_direction", filters.orderDirection);
  }
  if (filters.limit !== DEFAULT_LIMIT) params.set("limit", String(filters.limit));
  if (filters.page !== DEFAULT_PAGE) params.set("page", String(filters.page));

  return params;
}

function countActiveFilters(filters: PropertiesListFilters): number {
  return [
    filters.status !== "all",
    filters.trackedAgencyId !== "all",
    filters.duplicateGroup !== "all",
    filters.pushedToCrm !== "all",
    filters.pendingCrmUpdate !== "all",
    Boolean(filters.dateFrom),
    Boolean(filters.dateTo),
  ].filter(Boolean).length;
}

export function usePropertiesListFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const activeFilterCount = countActiveFilters(filters);

  const setFilters = useCallback(
    (patch: PropertiesListFilterPatch) => {
      setSearchParams(
        (prev) => {
          const current = parseFilters(prev);
          const next: PropertiesListFilters = {
            ...current,
            ...patch,
          };

          if (!("page" in patch)) {
            next.page = DEFAULT_PAGE;
          }

          return buildSearchParams(next);
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setFilters({
      status: "all",
      trackedAgencyId: "all",
      duplicateGroup: "all",
      pushedToCrm: "all",
      pendingCrmUpdate: "all",
      dateFrom: "",
      dateTo: "",
      orderBy: DEFAULT_ORDER_BY,
      orderDirection: DEFAULT_ORDER_DIRECTION,
      page: DEFAULT_PAGE,
    });
  }, [setFilters]);

  return {
    ...filters,
    activeFilterCount,
    setFilters,
    clearFilters,
  };
}
