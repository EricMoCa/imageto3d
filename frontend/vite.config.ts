import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // En desarrollo, proxy redirige llamadas de API al servidor FastAPI (puerto 8000).
    proxy: {
      "/generate-3d":       "http://localhost:8000",
      "/generate-3d-multi": "http://localhost:8000",
      "/files":             "http://localhost:8000",
      "/health":            "http://localhost:8000",
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
