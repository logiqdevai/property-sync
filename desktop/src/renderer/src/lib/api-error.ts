import { isAxiosError } from "axios";

/** The API's own error message when it sent one, else a plain fallback for the user. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    if (!error.response) return "Can't reach Property Sync. Check the internet connection.";
    const message = (error.response.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message.join(", ");
    if (message) return message;
  }
  return fallback;
}
