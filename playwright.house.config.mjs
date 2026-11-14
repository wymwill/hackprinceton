import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "house.spec.mjs",
  outputDir: "./.data/house-ui-results",
  workers: 1,
  timeout: 45_000,
  use: { baseURL: process.env.API_URL ?? "http://127.0.0.1:3219", browserName: "chromium", headless: true },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
