import type { ListingType } from "@/features/properties/interfaces/properties.interfaces";
import { ListingTypeFormOptions } from "@/config/constants/dropdowns/properties/listing-type-form.options";

export const ListingTypeFilterOptions: { id: ListingType | "all"; label: string }[] = [
  { id: "all", label: "All listing types" },
  ...ListingTypeFormOptions,
];
