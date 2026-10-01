import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 4182, strictPort: true },
  preview: { port: 4182, strictPort: true },
});
