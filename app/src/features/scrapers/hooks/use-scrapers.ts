import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  activateScraperVersion,
  createScraper,
  createScraperVersion,
  deleteScraper,
  deleteScrapers,
  getScraper,
  getScraperVersions,
  getScrapers,
  runScraperNow,
  updateScraper,
} from "../services/scrapers.services";
import type {
  CreateScraperPayload,
  CreateScraperVersionPayload,
  DeleteScrapersPayload,
  ScraperListQuery,
  UpdateScraperPayload,
} from "../interfaces/scrapers.interfaces";

export const useScrapers = (query: ScraperListQuery) => {
  return useQuery({
    queryKey: ["scrapers", "list", query],
    queryFn: () => getScrapers(query),
  });
};

export const useScraper = (id: string) => {
  return useQuery({
    queryKey: ["scrapers", "detail", id],
    queryFn: () => getScraper(id),
    enabled: !!id,
  });
};

export const useScraperVersions = (id: string) => {
  return useQuery({
    queryKey: ["scrapers", "versions", id],
    queryFn: () => getScraperVersions(id),
    enabled: !!id,
  });
};

export const useCreateScraper = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateScraperPayload) => createScraper(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      toast({ title: "Scraper created", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not create scraper", description: error.message, variant: "error" });
    },
  });
};

export const useCreateScraperVersion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateScraperVersionPayload }) =>
      createScraperVersion(id, payload),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      queryClient.invalidateQueries({ queryKey: ["scrapers", "versions", id] });
      toast({ title: "Scraper version created", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not create scraper version", description: error.message, variant: "error" });
    },
  });
};

export const useActivateScraperVersion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) =>
      activateScraperVersion(id, versionId),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      queryClient.invalidateQueries({ queryKey: ["scrapers", "versions", id] });
      toast({ title: "Scraper version activated", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not activate scraper version", description: error.message, variant: "error" });
    },
  });
};

export const useUpdateScraper = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateScraperPayload }) =>
      updateScraper(id, payload),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      queryClient.invalidateQueries({ queryKey: ["scrapers", "versions", id] });
      toast({ title: "Scraper updated", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({ title: "Could not update scraper", description: error.message, variant: "error" });
    },
  });
};

export const useRunScraperNow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => runScraperNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      queryClient.invalidateQueries({ queryKey: ["crawlRuns"] });
      toast({ title: "Crawl run triggered", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not run scraper",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteScraper = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteScraper(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      toast({ title: "Scraper deleted", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not delete scraper",
        description: error.message,
        variant: "error",
      });
    },
  });
};

export const useDeleteScrapers = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeleteScrapersPayload) => deleteScrapers(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      toast({ title: "Scrapers deleted", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Could not delete scrapers",
        description: error.message,
        variant: "error",
      });
    },
  });
};
