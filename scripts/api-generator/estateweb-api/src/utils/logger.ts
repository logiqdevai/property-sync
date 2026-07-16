/* eslint-disable no-console */
export const logger = {
  info(message: string): void {
    console.log(`[capturer] ${message}`);
  },
  warn(message: string): void {
    console.warn(`[capturer] WARN ${message}`);
  },
  error(message: string): void {
    console.error(`[capturer] ERROR ${message}`);
  },
};
