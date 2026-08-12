import {
  OrderBy,
  type OrderBy as OrderByType,
} from "@/interfaces/filters/filters.interface";

export const PropertySortByOptions: { id: OrderByType; label: string }[] = [
  { id: OrderBy.UPDATED_AT, label: "Updated at" },
  { id: OrderBy.CREATED_AT, label: "Created at" },
  { id: OrderBy.PRICE, label: "Price" },
];
