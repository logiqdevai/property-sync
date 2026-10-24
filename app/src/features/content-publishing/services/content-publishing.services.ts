import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  ContentPublishingConfig,
  UpsertContentPublishingConfigPayload,
} from "../interfaces/content-publishing.interfaces";

/** With `userId` (admin only) the config of that user's tracker is addressed instead of the caller's. */
const contentPublishingUrl = (agencyId: string, userId?: string) =>
  userId
    ? ApiRoutes.admin.agencies.trackerContentPublishing(agencyId, userId)
    : ApiRoutes.agencies.contentPublishing(agencyId);

export const getContentPublishingConfig = async (
  agencyId: string,
  userId?: string,
): Promise<ContentPublishingConfig | null> => {
  try {
    const response = await axiosInstance.get(
      contentPublishingUrl(agencyId, userId),
    );
    return response.data;
  } catch (error) {
    throw new Error("Failed to load content publishing config.");
  }
};

export const upsertContentPublishingConfig = async (
  agencyId: string,
  payload: UpsertContentPublishingConfigPayload,
  userId?: string,
): Promise<ContentPublishingConfig> => {
  try {
    const response = await axiosInstance.put(
      contentPublishingUrl(agencyId, userId),
      payload,
    );
    return response.data;
  } catch (error) {
    throw new Error("Failed to save content publishing config.");
  }
};

export const deleteContentPublishingConfig = async (
  agencyId: string,
  userId?: string,
): Promise<void> => {
  try {
    await axiosInstance.delete(contentPublishingUrl(agencyId, userId));
  } catch (error) {
    throw new Error("Failed to delete content publishing config.");
  }
};

export const bulkSetAiBatch = async (
  useAiBatch: boolean,
): Promise<{ updated: number }> => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.contentPublishing.bulkAiBatch,
      { use_ai_batch: useAiBatch },
    );
    return response.data;
  } catch (error) {
    throw new Error("Failed to update AI batch setting.");
  }
};
