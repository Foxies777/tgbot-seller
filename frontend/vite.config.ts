import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/static/pwa/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/static": "http://localhost:8000"
    }
  }
});
