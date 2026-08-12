import {
  OrderDirection,
  type OrderDirection as OrderDirectionType,
} from "@/interfaces/filters/filters.interface";

export const OrderDirectionOptions: {
  id: OrderDirectionType;
  label: string;
}[] = [
  { id: OrderDirection.DESC, label: "Descending" },
  { id: OrderDirection.ASC, label: "Ascending" },
];
