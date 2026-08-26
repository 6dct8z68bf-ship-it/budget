import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Mirrors the aliases in vite.config.mts so unit tests resolve the same
// $lib / $components / $shared imports as the Vite build.
const root = resolve(__dirname, "src/client");

export default defineConfig({
  resolve: {
    alias: {
      $lib: resolve(root, "lib"),
      $components: resolve(root, "components"),
      $shared: resolve(__dirname, "src/shared"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
