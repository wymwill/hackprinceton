import type { NextConfig } from "next";

/**
 * The Next app is the Bet Series API (src/app/api/series) plus the app icons.
 * Every other path is the Bet Series app in frontend/, a single-page React app:
 * - in development, forwarded to its Vite dev server (`npm run dev` starts both);
 * - in production, served from public/app/, which `npm run build` fills.
 */
const dev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR ?? ".next",
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      // Only for paths no API route, icon or file already answers.
      fallback: [{ source: "/:path*", destination: dev ? "http://127.0.0.1:5173/:path*" : "/app/index.html" }],
    };
  },
};

export default nextConfig;
