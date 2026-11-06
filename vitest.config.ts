import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) },
  },
  test: {
    // AgentKit signature tests are CPU-heavy and exceed 5 s when the whole suite runs in parallel.
    testTimeout: 20_000,
    exclude: ["**/node_modules/**", "**/.next/**", "contracts/**"],
  },
});
