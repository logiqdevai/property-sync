import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  activateScraperVersion,
  createScraper,
  createScraperVersion,
  getScraper,
  getScraperVersions,
  getScrapers,
  runScraperNow,
  updateScraper,
} from "../services/scrapers.services";
import type {
  CreateScraperPayload,
  CreateScraperVersionPayload,
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
      toast({ title: "Crawl run triggered", duration: 2000, variant: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Manual runs are not available yet",
        description: error.message || "Coming with the crawl engine.",
        variant: "error",
      });
    },
  });
};
