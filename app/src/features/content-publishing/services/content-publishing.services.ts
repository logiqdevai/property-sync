import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  ContentPublishingConfig,
  UpsertContentPublishingConfigPayload,
} from "../interfaces/content-publishing.interfaces";

export const getContentPublishingConfig = async (
  agencyId: string,
): Promise<ContentPublishingConfig | null> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.agencies.contentPublishing(agencyId),
    );
    return response.data;
  } catch (error) {
    throw new Error("Failed to load content publishing config.");
  }
};

export const upsertContentPublishingConfig = async (
  agencyId: string,
  payload: UpsertContentPublishingConfigPayload,
): Promise<ContentPublishingConfig> => {
  try {
    const response = await axiosInstance.put(
      ApiRoutes.agencies.contentPublishing(agencyId),
      payload,
    );
    return response.data;
  } catch (error) {
    throw new Error("Failed to save content publishing config.");
  }
};

export const deleteContentPublishingConfig = async (
  agencyId: string,
): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.agencies.contentPublishing(agencyId));
  } catch (error) {
    throw new Error("Failed to delete content publishing config.");
  }
};
