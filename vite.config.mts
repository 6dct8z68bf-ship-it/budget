import { defineConfig } from "vite";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

const root = resolve(__dirname, "src/client");

// The Node API server (src/server/server.js) runs on 5173 in dev. Vite serves the
// client on 5174 and proxies API/auth traffic to it so the HttpOnly SameSite=Lax
// session cookie stays same-origin (a cross-origin dev setup silently breaks auth).
const API_TARGET = process.env.API_TARGET || "http://127.0.0.1:5173";

export default defineConfig({
  root,
  publicDir: resolve(root, "public"),
  resolve: {
    alias: {
      $lib: resolve(root, "lib"),
      $components: resolve(root, "components"),
      $shared: resolve(__dirname, "src/shared"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/auth": { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: true,
      rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        landing: resolve(root, "landing.html"),
        publicSite: resolve(root, "public.html"),
      },
    },
  },
  plugins: [svelte({ preprocess: vitePreprocess() })],
});
