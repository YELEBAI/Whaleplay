import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@neo-tavern/shared": new URL("../shared/src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
