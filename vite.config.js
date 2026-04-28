import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),   // Tailwind v4 works through this
  ],
  optimizeDeps: {
    // Pre-bundle heavy map deps used inside lazy-loaded UnifiedMapView to avoid
    // mid-session re-optimization ("Outdated Optimize Dep" 504).
    include: [
      "deck.gl",
      "@deck.gl/core",
      "@deck.gl/layers",
      "@deck.gl/google-maps",
      "@loaders.gl/core",
      "@loaders.gl/worker-utils",
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
    proxy: {
      "/api": {
        target: "http://localhost:5224",
        changeOrigin: true,
        secure: false,
      },
      "/Admin": {
        target: "http://localhost:5224",
        changeOrigin: true,
        secure: false,
      },
      "/Home": {
        target: "http://localhost:5224",
        changeOrigin: true,
        secure: false,
      },
      "/ExcelUpload": {
        target: "http://localhost:5224",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("exceljs") || id.includes("jszip") || id.includes("file-saver")) {
            return "vendor-export";
          }

          if (id.includes("html2canvas") || id.includes("html-to-image")) {
            return "vendor-capture";
          }

          if (id.includes("@deck.gl") || id.includes("deck.gl") || id.includes("@loaders.gl")) {
            return "vendor-map";
          }

          if (id.includes("@react-google-maps") || id.includes("@googlemaps")) {
            return "vendor-googlemaps";
          }

          if (id.includes("recharts") || id.includes("@mui/x-charts")) {
            return "vendor-charts";
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
