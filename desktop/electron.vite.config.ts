import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const shared = resolve(__dirname, "src/shared");

export default defineConfig({
  main: {
    resolve: { alias: { "@shared": shared } },
  },
  preload: {
    resolve: { alias: { "@shared": shared } },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), tailwindcss()],
    server: { port: 5174, strictPort: true },
    envDir: __dirname,
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
        "@shared": shared,
      },
    },
  },
});
