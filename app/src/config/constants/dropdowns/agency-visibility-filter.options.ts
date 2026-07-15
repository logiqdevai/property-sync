export type AgencyVisibilityFilter =
  | "all"
  | "visible_enabled"
  | "visible_disabled"
  | "hidden";

export const AgencyVisibilityFilterOptions: { id: AgencyVisibilityFilter; label: string }[] = [
  { id: "all", label: "All agencies" },
  { id: "visible_enabled", label: "Visible & trackable" },
  { id: "visible_disabled", label: "Visible, not trackable" },
  { id: "hidden", label: "Hidden" },
];

export function agencyVisibilityFilterToQuery(
  filter: AgencyVisibilityFilter,
): { is_visible?: boolean; is_enabled?: boolean } {
  switch (filter) {
    case "visible_enabled":
      return { is_visible: true, is_enabled: true };
    case "visible_disabled":
      return { is_visible: true, is_enabled: false };
    case "hidden":
      return { is_visible: false };
    default:
      return {};
  }
}
