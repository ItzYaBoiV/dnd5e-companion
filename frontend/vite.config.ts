/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://backend:3001",
        changeOrigin: true,
        timeout: 1_800_000,
        proxyTimeout: 1_800_000,
      },
    },
  },
  preview: { port: 4173 },
});
