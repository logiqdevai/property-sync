import {
  PropertyChangeFilters,
  type PropertyChangeFilter,
} from "@/features/properties/interfaces/properties.interfaces";

export { PropertyChangeFilters, type PropertyChangeFilter };

export const PropertyChangeFilterOptions: {
  id: PropertyChangeFilter | "all";
  label: string;
}[] = [
  { id: "all", label: "All changes" },
  { id: PropertyChangeFilters.NEW, label: "New" },
  { id: PropertyChangeFilters.UPDATED, label: "Any update" },
  { id: PropertyChangeFilters.PRICE_CHANGED, label: "Price changed" },
  { id: PropertyChangeFilters.IMAGES_CHANGED, label: "Images changed" },
  { id: PropertyChangeFilters.FIELDS_UPDATED, label: "Fields updated" },
  { id: PropertyChangeFilters.STATUS_CHANGED, label: "Status changed" },
  { id: PropertyChangeFilters.REMOVED, label: "Removed" },
  { id: PropertyChangeFilters.REAPPEARED, label: "Reappeared" },
];
