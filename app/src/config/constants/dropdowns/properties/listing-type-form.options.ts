import {
  ListingTypes,
  type ListingType,
} from "@/features/properties/interfaces/properties.interfaces";

export const ListingTypeFormOptions: { id: ListingType; label: string }[] = [
  { id: ListingTypes.SALE, label: "Sale" },
  { id: ListingTypes.RENT, label: "Rent" },
  { id: ListingTypes.SHORT_TERM_RENT, label: "Short-term rent" },
  { id: ListingTypes.UNKNOWN, label: "Unknown" },
];

export const EstateWebListingTypeFormOptions: {
  id: ListingType;
  label: string;
}[] = ListingTypeFormOptions.filter(
  (option) =>
    option.id === ListingTypes.SALE || option.id === ListingTypes.RENT,
);

export const ESTATEWEB_DEFAULT_LISTING_TYPES: ListingType[] =
  EstateWebListingTypeFormOptions.map((option) => option.id);

export function getListingTypeLabel(type: ListingType | string): string {
  return (
    ListingTypeFormOptions.find((option) => option.id === type)?.label ?? type
  );
}
