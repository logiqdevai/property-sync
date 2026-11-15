import { bridgeErrorMessage } from "@/features/crawl-session/services/crawl-session.services";

export const installAppUpdate = async (): Promise<void> => {
  try {
    await window.desktop.update.install();
  } catch (error) {
    throw bridgeErrorMessage(error, "The update could not be installed. Please try again.");
  }
};
