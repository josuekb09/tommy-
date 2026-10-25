import { defineConfig } from "vitest/config"

// Standalone config for the agenda accuracy bench. The bench calls the real
// Gemini API and so is not part of the default test run (vitest.config.ts
// excludes scripts/). Run with `npm run eval:agendas`.
export default defineConfig({
  test: {
    include: ["scripts/*.test.ts"],
    environment: "node",
    testTimeout: 1_800_000,
    hookTimeout: 60_000,
  },
})
