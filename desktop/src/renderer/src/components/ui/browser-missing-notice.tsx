import { Button } from "@heroui/react";
import { Notice } from "@/components/ui/notice";
import { useGetBrowserCheck, useOpenExternal } from "@/features/desktop-app/hooks/use-desktop-app";

const CHROME_DOWNLOAD_URL = "https://www.google.com/chrome/";

/** Shown when neither Chrome nor Edge is installed: the crawler drives the installed browser. */
export function BrowserMissingNotice() {
  const { data, refetch } = useGetBrowserCheck();
  const { mutate: openExternal } = useOpenExternal();
  if (!data || data.channel) return null;

  return (
    <Notice
      status="danger"
      title="Google Chrome is needed"
      description="The crawler works through Google Chrome on this computer. Install it, then press Check again."
      actions={
        <>
          <Button size="sm" variant="primary" onPress={() => openExternal(CHROME_DOWNLOAD_URL)}>
            Download Chrome
          </Button>
          <Button size="sm" variant="secondary" onPress={() => void refetch()}>
            Check again
          </Button>
        </>
      }
    />
  );
}
