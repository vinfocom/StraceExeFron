import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),   // Tailwind v4 works through this
  ],
  optimizeDeps: {
    // Pre-bundle heavy map deps used inside lazy-loaded UnifiedMapView to avoid
    // mid-session re-optimization ("Outdated Optimize Dep" 504).
    include: [
      "@deck.gl/core",
      "@deck.gl/layers",
      "@deck.gl/google-maps",
      "@loaders.gl/core",
      "@loaders.gl/worker-utils",
      "clsx",
      "tailwind-merge",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // ExcelJS ships as one prebuilt browser file, fetched only for workbook operations.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          const moduleId = id.replaceAll("\\", "/");

          if (moduleId.includes("/node_modules/exceljs/")) return "vendor-exceljs";
          if (moduleId.includes("/node_modules/jszip/")) return "vendor-jszip";
          if (moduleId.includes("/node_modules/file-saver/")) return "vendor-file-saver";

          if (moduleId.includes("/node_modules/three/build/three.core.js")) return "vendor-three-core";
          if (moduleId.includes("/node_modules/three/")) return "vendor-three";
          if (moduleId.includes("/node_modules/@react-three/fiber/")) return "vendor-react-three";
          if (moduleId.includes("/node_modules/@react-three/drei/")) return "vendor-drei";
          if (moduleId.includes("/node_modules/three-stdlib/")) return "vendor-three-stdlib";

          if (moduleId.includes("/node_modules/@deck.gl/core/")) return "vendor-deck-core";
          if (moduleId.includes("/node_modules/@deck.gl/layers/")) return "vendor-deck-layers";
          if (moduleId.includes("/node_modules/@luma.gl/")) return "vendor-luma";
          if (moduleId.includes("/node_modules/@math.gl/")) return "vendor-math";
          if (moduleId.includes("/node_modules/@loaders.gl/")) return "vendor-loaders";

          if (id.includes("html2canvas") || id.includes("html-to-image")) {
            return "vendor-capture";
          }

          if (id.includes("@react-google-maps") || id.includes("@googlemaps")) {
            return "vendor-googlemaps";
          }

          if (id.includes("@mui/") || id.includes("@emotion/")) {
            return "vendor-mui";
          }

          if (id.includes("react-router-dom")) {
            return "vendor-router";
          }

          if (id.includes("react-dom") || id.includes("/react/")) {
            return "vendor-react";
          }
        },
      },
    },
  },
})
