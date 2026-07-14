import { z } from "zod";
import {
  ListingTypes,
  PropertyStatuses,
  PropertyTypes,
} from "@/features/properties/interfaces/properties.interfaces";

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}, z.number().nullable());

export const updateUserPropertyFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  listing_type: z.enum([
    ListingTypes.SALE,
    ListingTypes.RENT,
    ListingTypes.SHORT_TERM_RENT,
    ListingTypes.UNKNOWN,
  ]),
  property_type: z.enum([
    PropertyTypes.APARTMENT,
    PropertyTypes.HOUSE,
    PropertyTypes.VILLA,
    PropertyTypes.MAISONETTE,
    PropertyTypes.STUDIO,
    PropertyTypes.LAND,
    PropertyTypes.COMMERCIAL,
    PropertyTypes.OFFICE,
    PropertyTypes.WAREHOUSE,
    PropertyTypes.PARKING,
    PropertyTypes.OTHER,
    PropertyTypes.UNKNOWN,
  ]),
  status: z.enum([
    PropertyStatuses.ACTIVE,
    PropertyStatuses.INACTIVE,
    PropertyStatuses.REMOVED,
    PropertyStatuses.SOLD,
    PropertyStatuses.RENTED,
    PropertyStatuses.UNKNOWN,
  ]),
  price: optionalNumber.optional(),
  currency: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  square_meters: optionalNumber.optional(),
  bedrooms: optionalNumber.optional(),
  bathrooms: optionalNumber.optional(),
  floor: z.string().nullable().optional(),
  construction_year: optionalNumber.optional(),
});

export type UpdateUserPropertyFormValues = z.infer<typeof updateUserPropertyFormSchema>;
