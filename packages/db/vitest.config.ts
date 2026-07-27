import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // I test condividono lo stesso database: niente parallelismo tra file.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
