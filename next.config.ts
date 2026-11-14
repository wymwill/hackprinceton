import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR ?? ".next",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The AI Bookie's LangChain packages are Node-only (langsmith has optional deps like `ws`),
  // so load them with plain Node require instead of bundling them.
  serverExternalPackages: ["deepagents", "langchain", "langsmith", "@langchain/core", "@langchain/anthropic", "@langchain/langgraph"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
