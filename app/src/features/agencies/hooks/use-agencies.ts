import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  createAgency,
  deleteAgency,
  getAgencies,
  getAgency,
  updateAgency,
  updateAgencyStatus,
  updateAgencyVisibility,
} from "../services/agencies.services";
import type {
  AgencyListQuery,
  AgencyStatus,
  CreateAgencyPayload,
  UpdateAgencyPayload,
  UpdateAgencyVisibilityPayload,
} from "../interfaces/agencies.interfaces";

export const useAgencies = (query: AgencyListQuery) => {
  return useQuery({
    queryKey: ["agencies", "list", query],
    queryFn: () => getAgencies(query),
  });
};

export const useAgency = (id: string) => {
  return useQuery({
    queryKey: ["agencies", "detail", id],
    queryFn: () => getAgency(id),
    enabled: !!id,
  });
};

export const useCreateAgency = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAgencyPayload) => createAgency(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      toast({ title: "Agency created", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not create agency", description: error.message, variant: "error" });
    },
  });
};

export const useUpdateAgency = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAgencyPayload }) =>
      updateAgency(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      toast({ title: "Agency updated", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not update agency", description: error.message, variant: "error" });
    },
  });
};

export const useUpdateAgencyStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AgencyStatus }) =>
      updateAgencyStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      toast({ title: "Agency status updated", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not update agency status", description: error.message, variant: "error" });
    },
  });
};

export const useUpdateAgencyVisibility = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAgencyVisibilityPayload }) =>
      updateAgencyVisibility(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      toast({ title: "Agency visibility updated", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not update agency visibility", description: error.message, variant: "error" });
    },
  });
};

export const useDeleteAgency = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAgency(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      toast({ title: "Agency deleted", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not delete agency", description: error.message, variant: "error" });
    },
  });
};
