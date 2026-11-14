import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The rules live in backend/src. The frontend imports the same module for
// read-only views (pools, standings, blockers), so screens and server agree.
const rules = fileURLToPath(new URL("../backend/src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@rules": rules } },
  server: {
    port: 5173,
    fs: { allow: [".", rules] },
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
