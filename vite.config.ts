import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Never reload on its own: an update must not interrupt a speech.
      registerType: "prompt",
      includeAssets: ["Tommy-app-icon.svg", "Tommy-logo-dark.svg", "Tommy-logo-light.svg", "Tommy-mark.svg"],
      // clientsClaim makes the first visit offline-ready at once; without skipWaiting,
      // later versions still wait for the user to accept the update prompt.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
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
