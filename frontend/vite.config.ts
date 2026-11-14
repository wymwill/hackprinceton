import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// One .env.local at the repo root configures sign-in for both the Next app and
// this one. Only the Supabase URL and publishable (anon) key are read, so no
// other variable can end up in the browser bundle. A frontend/.env.local wins.
const root = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, ""), ...loadEnv(mode, process.cwd(), "") };
  const pick = (...names: string[]) => names.map((n) => env[n]).find((v) => v) ?? "";
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(pick("VITE_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")),
      __SUPABASE_KEY__: JSON.stringify(
        pick(
          "VITE_SUPABASE_PUBLISHABLE_KEY",
          "VITE_SUPABASE_ANON_KEY",
          "SUPABASE_PUBLISHABLE_KEY",
          "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        )
      ),
    },
    server: {
      port: 5173,
      // The Bet Series API runs inside the Next app (src/app/api/series). Start it with `npm run dev` at the repo root.
      proxy: { "/api": env.BWF_API_ORIGIN || "http://localhost:3000" },
    },
  };
});
