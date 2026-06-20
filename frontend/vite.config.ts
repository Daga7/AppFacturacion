import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Facturación App",
        short_name: "Facturación",
        description: "Sistema de facturación e inventario",
        theme_color: "#1e293b",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/favicon.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/localhost:3000\/api\/.*/,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", expiration: { maxEntries: 50 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3000",
    },
  },
});
