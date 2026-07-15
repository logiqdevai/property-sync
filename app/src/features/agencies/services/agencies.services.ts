import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  AgencyListQuery,
  CreateAgencyPayload,
  PaginatedResponse,
  SourceAgency,
  UpdateAgencyPayload,
  UpdateAgencyVisibilityPayload,
  UpdateTrackerAdminSettingsPayload,
} from "../interfaces/agencies.interfaces";

export const getAgencies = async (
  query?: AgencyListQuery,
): Promise<PaginatedResponse<SourceAgency>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.agencies.list, { params: query });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch agencies. Please try again.");
  }
};

export const getAgency = async (id: string): Promise<SourceAgency> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.agencies.detail(id));
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch agency. Please try again.");
  }
};

export const createAgency = async (payload: CreateAgencyPayload): Promise<SourceAgency> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.agencies.list, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to create agency. Please try again.");
  }
};

export const updateAgency = async (
  id: string,
  payload: UpdateAgencyPayload,
): Promise<SourceAgency> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.admin.agencies.detail(id), payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to update agency. Please try again.");
  }
};

export const updateAgencyVisibility = async (
  id: string,
  payload: UpdateAgencyVisibilityPayload,
): Promise<SourceAgency> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.admin.agencies.visibility(id), payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to update agency visibility. Please try again.");
  }
};

export const deleteAgency = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.admin.agencies.detail(id));
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete agency. Please try again.");
  }
};

export const updateTrackerAdminSettings = async (
  agencyId: string,
  userId: string,
  payload: UpdateTrackerAdminSettingsPayload,
) => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.admin.agencies.trackerSettings(agencyId, userId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update tracker settings. Please try again.",
    );
  }
};
