import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  AgencyListQuery,
  BulkAgencyTrackingPayload,
  BulkAgencyTrackingResult,
  LinkIntegrationPayload,
  PaginatedResponse,
  TrackableAgency,
  TrackAgencyPayload,
  TrackedAgencyIntegrationLink,
  UserTrackedAgency,
} from "../interfaces/user-tracked-agencies.interfaces";

export const getTrackableAgencies = async (
  query?: AgencyListQuery,
): Promise<PaginatedResponse<TrackableAgency>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.agencies.list, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch agencies. Please try again.");
  }
};

export const trackAgency = async (
  agencyId: string,
  payload: TrackAgencyPayload,
): Promise<UserTrackedAgency> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.agencies.track(agencyId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to track agency.");
  }
};

export const updateAgencyTracking = async (
  agencyId: string,
  payload: TrackAgencyPayload,
): Promise<UserTrackedAgency> => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.agencies.track(agencyId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update tracking preferences.",
    );
  }
};

export const untrackAgency = async (agencyId: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.agencies.track(agencyId));
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to untrack agency.");
  }
};

export const bulkAgencyTracking = async (
  payload: BulkAgencyTrackingPayload,
): Promise<BulkAgencyTrackingResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.agencies.bulkTracking,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update agencies.",
    );
  }
};

export const getIntegrationLink = async (
  agencyId: string,
): Promise<TrackedAgencyIntegrationLink | null> => {
  try {
    const response = await axiosInstance.get<TrackedAgencyIntegrationLink | null>(
      ApiRoutes.agencies.integrationLink(agencyId),
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to fetch integration link.",
    );
  }
};

export const linkIntegration = async (
  agencyId: string,
  payload: LinkIntegrationPayload,
): Promise<TrackedAgencyIntegrationLink> => {
  try {
    const response = await axiosInstance.put(
      ApiRoutes.agencies.integrationLink(agencyId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to link integration.",
    );
  }
};

export const unlinkIntegration = async (agencyId: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.agencies.integrationLink(agencyId));
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to unlink integration.",
    );
  }
};
