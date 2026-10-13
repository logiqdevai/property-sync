import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  DelistedPropertyAlert,
  KnownClient,
  PropertyClient,
  PropertyClientPayload,
} from "../interfaces/property-clients.interfaces";

const fail = (error: any, fallback: string): never => {
  throw new Error(error?.response?.data?.message || fallback);
};

export const getPropertyClients = async (
  userPropertyId: string,
): Promise<PropertyClient[]> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.propertyClients.forProperty(userPropertyId),
    );
    return response.data;
  } catch (error: any) {
    return fail(error, "Failed to load clients.");
  }
};

export const createPropertyClient = async (
  userPropertyId: string,
  payload: PropertyClientPayload,
): Promise<PropertyClient> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.propertyClients.forProperty(userPropertyId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    return fail(error, "Failed to add client.");
  }
};

export const updatePropertyClient = async (
  id: string,
  payload: Partial<PropertyClientPayload>,
): Promise<PropertyClient> => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.propertyClients.detail(id),
      payload,
    );
    return response.data;
  } catch (error: any) {
    return fail(error, "Failed to update client.");
  }
};

export const deletePropertyClient = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.propertyClients.detail(id));
  } catch (error: any) {
    fail(error, "Failed to remove client.");
  }
};

export const getKnownClients = async (): Promise<KnownClient[]> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.propertyClients.known);
    return response.data;
  } catch (error: any) {
    return fail(error, "Failed to load clients.");
  }
};

export const getDelistedAlerts = async (): Promise<DelistedPropertyAlert[]> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.propertyClients.delistedAlerts,
    );
    return response.data;
  } catch (error: any) {
    return fail(error, "Failed to load alerts.");
  }
};

export const acknowledgeDelistedAlerts = async (
  userPropertyIds: string[],
): Promise<void> => {
  try {
    await axiosInstance.post(ApiRoutes.propertyClients.acknowledgeDelisted, {
      user_property_ids: userPropertyIds,
    });
  } catch (error: any) {
    fail(error, "Failed to dismiss alert.");
  }
};
