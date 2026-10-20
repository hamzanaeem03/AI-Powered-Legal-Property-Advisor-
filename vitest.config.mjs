import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
    // Each file starts its own in-memory MongoDB; the first run downloads the binary
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
})
