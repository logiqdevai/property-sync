import { useMutation, useQuery } from "@tanstack/react-query";
import type { EstateWebPushSiteSetting } from "../interfaces/estateweb-integration-settings.interfaces";
import type { EstateWebIdentifierType } from "../interfaces/estateweb.interfaces";
import {
  bulkDeleteEstateWebPropertiesByCodes,
  bulkUpdateEstateWebPropertySites,
  getEstateWebAdminIntegrations,
  getEstateWebDuplicateProperties,
  getEstateWebEnergyClassCatalog,
  getEstateWebFeaturesCatalog,
  getEstateWebFloorCatalog,
  getEstateWebListingTypeCatalog,
  getEstateWebLocationCatalog,
  getEstateWebPropertyTypeCatalog,
  getEstateWebRoadTypeCatalog,
} from "../services/estateweb.services";

const catalogQueryOptions = {
  staleTime: Infinity,
  gcTime: Infinity,
} as const;

export const useEstateWebLocationCatalog = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "catalog", "locations"],
    queryFn: getEstateWebLocationCatalog,
    enabled,
    ...catalogQueryOptions,
  });
};

export const useEstateWebFloorCatalog = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "catalog", "floors"],
    queryFn: getEstateWebFloorCatalog,
    enabled,
    ...catalogQueryOptions,
  });
};

export const useEstateWebEnergyClassCatalog = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "catalog", "energy-classes"],
    queryFn: getEstateWebEnergyClassCatalog,
    enabled,
    ...catalogQueryOptions,
  });
};

export const useEstateWebRoadTypeCatalog = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "catalog", "road-types"],
    queryFn: getEstateWebRoadTypeCatalog,
    enabled,
    ...catalogQueryOptions,
  });
};

export const useEstateWebListingTypeCatalog = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "catalog", "listing-types"],
    queryFn: getEstateWebListingTypeCatalog,
    enabled,
    ...catalogQueryOptions,
  });
};

export const useEstateWebPropertyTypeCatalog = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "catalog", "property-types"],
    queryFn: getEstateWebPropertyTypeCatalog,
    enabled,
    ...catalogQueryOptions,
  });
};

export const useEstateWebFeaturesCatalog = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "catalog", "features"],
    queryFn: getEstateWebFeaturesCatalog,
    enabled,
    ...catalogQueryOptions,
  });
};

export const useEstateWebAdminIntegrations = (enabled = true) => {
  return useQuery({
    queryKey: ["estateweb", "admin", "integrations"],
    queryFn: getEstateWebAdminIntegrations,
    enabled,
  });
};

export const useEstateWebDuplicateProperties = (
  userIntegrationId: string | null,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["estateweb", "admin", "duplicates", userIntegrationId],
    queryFn: () => getEstateWebDuplicateProperties(userIntegrationId as string),
    enabled: enabled && !!userIntegrationId,
  });
};

export const useBulkUpdateEstateWebPropertySites = () => {
  return useMutation({
    mutationFn: ({
      userIntegrationId,
      identifiers,
      sites,
      identifierType,
    }: {
      userIntegrationId: string;
      identifiers: string[];
      sites: EstateWebPushSiteSetting[];
      identifierType?: EstateWebIdentifierType;
    }) =>
      bulkUpdateEstateWebPropertySites(userIntegrationId, identifiers, sites, identifierType),
  });
};

export const useBulkDeleteEstateWebPropertiesByCodes = () => {
  return useMutation({
    mutationFn: ({
      userIntegrationId,
      identifiers,
      identifierType,
    }: {
      userIntegrationId: string;
      identifiers: string[];
      identifierType?: EstateWebIdentifierType;
    }) => bulkDeleteEstateWebPropertiesByCodes(userIntegrationId, identifiers, identifierType),
  });
};
