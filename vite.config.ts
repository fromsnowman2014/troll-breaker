import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require("./src/manifest.json");

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
        options: resolve(__dirname, "src/options/index.html"),
      },
    },
  },
  publicDir: "extension",
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
