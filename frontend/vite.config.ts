import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/static/pwa/",
  define: {
    "import.meta.env.VITE_ENABLE_SW": JSON.stringify(process.env.VITE_ENABLE_SW ?? "0")
  },
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "../app/static/pwa"),
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/static": "http://localhost:8000"
    }
  }
});
