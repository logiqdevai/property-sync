import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getLatestDesktopCrawler } from "../services/desktop-crawler.services";

const QUERY_KEY = "desktop-crawler-release";

export const useGetLatestDesktopCrawler = () => {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: getLatestDesktopCrawler,
  });
};

/**
 * Fetches a fresh signed link (they expire after a few minutes) and starts the download. The
 * file is served with `Content-Disposition: attachment`, so the page stays where it is.
 */
export const useDownloadDesktopCrawler = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const release = await getLatestDesktopCrawler();
      if (!release) throw new Error("No version of the desktop app has been published yet.");
      window.location.assign(release.download_url);
      return release;
    },
    onSuccess: (release) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({
        title: "Download started",
        description: `${release.file_name}. Open it to install the app.`,
        duration: 4000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not download the app", description: error.message, variant: "error" });
    },
  });
};
