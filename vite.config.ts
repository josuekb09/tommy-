import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: "autoUpdate", manifest: { name: "Tommy Timer", short_name: "Tommy", theme_color: "#14213D", background_color: "#F6F7FA", display: "standalone", icons: [{ src: "tommy-icon-192.png", sizes: "192x192", type: "image/png" }, { src: "tommy-icon-512.png", sizes: "512x512", type: "image/png" }] } })],
})
