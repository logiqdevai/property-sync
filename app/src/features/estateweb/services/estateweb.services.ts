import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { EstateWebLocationCatalogItem } from "../interfaces/estateweb.interfaces";

export const getEstateWebLocationCatalog = async (): Promise<
  EstateWebLocationCatalogItem[]
> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.estateweb.catalog.locations,
    );
    return response.data;
  } catch {
    throw new Error("Failed to fetch EstateWeb locations. Please try again.");
  }
};
