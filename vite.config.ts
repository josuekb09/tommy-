import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["Tommy-app-icon.svg", "Tommy-logo-dark.svg", "Tommy-logo-light.svg", "Tommy-mark.svg"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // skipWaiting: new SW takes over immediately on the next open.
        // clientsClaim: new SW controls all open tabs right after activation.
        // autoUpdate (above): when the new SW claims control, the page reloads once.
        // Every timing action is in IndexedDB so a mid-speech reload loses nothing.
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: "Tommy Timer",
        short_name: "Tommy",
        description: "Timer for speaking clubs and Toastmasters-style meetings.",
        theme_color: "#14213D",
        background_color: "#F6F7FA",
        display: "standalone",
        start_url: "/#/timer",
        icons: [
          { src: "tommy-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "tommy-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "tommy-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
})
