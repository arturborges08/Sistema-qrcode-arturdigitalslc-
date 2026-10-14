import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const api = "http://localhost:3000";

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, "../dist/web"),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: { "/api": api, "/r": api, "/health": api },
  },
});
