import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { CreateConnectionPayload } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import type { IntegrationClientSearchResult } from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";
import type {
  AgencyListQuery,
  AgencyTracker,
  TrackAgencyUsersResult,
  AgencyScheduleOverviewItem,
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
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to fetch agency. Please try again.",
    );
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

export const getAgenciesScheduleOverview = async (): Promise<AgencyScheduleOverviewItem[]> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.agencies.scheduleOverview);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to fetch agency schedules. Please try again.",
    );
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

export const getAgencyTrackers = async (agencyId: string): Promise<AgencyTracker[]> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.agencies.trackers(agencyId));
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to load users tracking this agency.",
    );
  }
};

export const trackAgencyUsers = async (
  agencyId: string,
  userIds: string[],
): Promise<TrackAgencyUsersResult> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.agencies.trackers(agencyId), {
      user_ids: userIds,
    });
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to track agency for users.");
  }
};

export const connectEstateWebForTracker = async (
  agencyId: string,
  userId: string,
  payload: CreateConnectionPayload,
) => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.agencies.trackerEstateWeb(agencyId, userId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to connect EstateWeb account.");
  }
};

export const searchCrmClientsForTracker = async (
  agencyId: string,
  userId: string,
  lastName: string,
): Promise<IntegrationClientSearchResult> => {
  try {
    const response = await axiosInstance.get<IntegrationClientSearchResult>(
      ApiRoutes.admin.agencies.trackerCrmClients(agencyId, userId),
      { params: { last_name: lastName } },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to search CRM clients.");
  }
};

export const setCrmClientForTracker = async (
  agencyId: string,
  userId: string,
  integrationClientId: number | null,
) => {
  try {
    const response = await axiosInstance.put(
      ApiRoutes.admin.agencies.trackerCrmClient(agencyId, userId),
      { integration_client_id: integrationClientId },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to save CRM client.");
  }
};
