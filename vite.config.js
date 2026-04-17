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
  },
})
