import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const API_URL = process.env.VITE_BASE_URL ?? "https://appfacturacion-1.onrender.com";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons.svg", "pwa-192x192.png", "pwa-512x512.png", "pwa-maskable-192x192.png", "pwa-maskable-512x512.png"],
      manifest: {
        name: "Facturación App",
        short_name: "Facturación",
        description: "Sistema de facturación e inventario",
        theme_color: "#1e293b",
        background_color: "#0f172a",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        scope: "/",
        start_url: "/",
        orientation: "any",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === new URL(API_URL).origin,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
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
