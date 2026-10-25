import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    // Component tests opt into jsdom with a `@vitest-environment jsdom` comment.
    environment: "node",
  },
})
