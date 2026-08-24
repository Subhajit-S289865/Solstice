import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { viteWatchIgnorePlugin, viteWatchOptions } from "./scripts/vite-watch-ignore.mjs";

/** Client-only bundle for the Windows app. The web preview still uses vite.config.ts. */
export default defineConfig({
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    watch: viteWatchOptions(),
  },
  resolve: { tsconfigPaths: true },
  build: {
    outDir: "dist-tauri",
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
  plugins: [
    viteWatchIgnorePlugin(),
    appEnvPlugin(),
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true },
    }),
    viteReact(),
  ],
});
