import {
  ListingTypes,
  type ListingType,
} from "@/features/properties/interfaces/properties.interfaces";

export const ListingTypeFilterOptions: { id: ListingType | "all"; label: string }[] = [
  { id: "all", label: "All listing types" },
  ...Object.values(ListingTypes).map((type) => ({
    id: type,
    label: type.replace(/_/g, " "),
  })),
];
