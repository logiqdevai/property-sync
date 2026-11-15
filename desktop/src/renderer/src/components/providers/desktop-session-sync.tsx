import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import { environments } from "@/config/environments";

/** Hands the signed-in user's token to the Electron main process, which makes the crawl's API calls. */
export function DesktopSessionSync() {
  const accessToken = useAuthStore((state) => state.access_token);

  useEffect(() => {
    void window.desktop.auth.setSession(
      accessToken ? { access_token: accessToken, api_url: environments.API_URL } : null,
    );
  }, [accessToken]);

  return null;
}
