import {
  PropertyTypes,
  type PropertyType,
} from "@/features/properties/interfaces/properties.interfaces";

export const PropertyTypeFilterOptions: { id: PropertyType | "all"; label: string }[] = [
  { id: "all", label: "All property types" },
  ...Object.values(PropertyTypes).map((type) => ({
    id: type,
    label: type.replace(/_/g, " "),
  })),
];
