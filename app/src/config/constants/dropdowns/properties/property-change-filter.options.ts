export const PropertyChangeFilters = {
  NEW: "new",
  UPDATED: "updated",
} as const;

export type PropertyChangeFilter =
  (typeof PropertyChangeFilters)[keyof typeof PropertyChangeFilters];

export const PropertyChangeFilterOptions: {
  id: PropertyChangeFilter | "all";
  label: string;
}[] = [
  { id: "all", label: "All changes" },
  { id: PropertyChangeFilters.NEW, label: "New" },
  { id: PropertyChangeFilters.UPDATED, label: "Updated" },
];
