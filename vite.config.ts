import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  server: {
    port: 5173,
    proxy: {
      // Keep the browser same-origin in dev; CORS stays enabled for direct
      // API access (e.g. other clients).
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/ws": { target: "ws://localhost:4000", ws: true },
    },
  },
});