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
      // La versión nueva no se activa sola: la app muestra "Hay una versión
      // nueva · Actualizar" (UpdateBanner) y recarga cuando la persona toca
      // el botón, así nunca se recarga en medio de una venta.
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons.svg", "pwa-192x192.png", "pwa-512x512.png", "pwa-maskable-192x192.png", "pwa-maskable-512x512.png"],
      manifest: {
        name: "EL BODEGÓN DE LA TECNOLOGÍA",
        short_name: "EL BODEGÓN",
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
        // La API nunca se sirve desde el service worker. Lo que el cajero
        // necesita sin internet lo guarda la propia app en IndexedDB, separado
        // por sede y con lo registrado sin conexión encima (src/lib/offline):
        // una caché aquí podría mostrar datos de otro usuario o esconder que
        // no hay conexión.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === new URL(API_URL).origin,
            handler: "NetworkOnly",
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
