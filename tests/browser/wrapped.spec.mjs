import { test, expect } from "@playwright/test";
import { stat } from "node:fs/promises";

test("public demo tells the complete story and exports a portrait share card", async ({ page }, info) => {
  await page.route("**/*", (route) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto("/wrapped-demo");
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /YOUR ALEA WRAPPED/ })).toBeVisible();
  await page.waitForTimeout(650);
  const box = await page.locator(".wrapped-scene").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: info.outputPath("wrapped-opening.png"), fullPage: true });

  if (info.project.name === "mobile") {
    await page.locator(".wrapped").evaluate((node) => {
      const from = new Touch({ identifier: 1, target: node, clientX: 310, clientY: 420 });
      const to = new Touch({ identifier: 1, target: node, clientX: 150, clientY: 422 });
      node.dispatchEvent(new TouchEvent("touchstart", { touches: [from], changedTouches: [from], bubbles: true }));
      node.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [to], bubbles: true }));
    });
    await expect(page.locator("#wrapped-story .scene-foot")).toContainText("02 / 09");
    await page.keyboard.press("Home");
    await expect(page.locator("#wrapped-story .scene-foot")).toContainText("01 / 09");
  }

  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".moment-house")).toContainText("THE HOUSE, IN REVIEW");
  await expect(page.locator(".moment-house")).toContainText(/confidence|result|scoreboard|investment|market/i);
  await page.waitForTimeout(650);
  await page.screenshot({ path: info.outputPath("wrapped-fumble.png"), fullPage: true });
  for (let i = 5; i < 9; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator("#wrapped-story .scene-foot")).toContainText("09 / 09");
  await page.waitForTimeout(650);
  await expect(page.getByText("THE COMEBACK KID", { exact: true })).toBeVisible();
  const poster = page.locator("#wrapped-poster");
  await expect(poster).toContainText("FICTIONAL DEMO DATA");
  await page.screenshot({ path: info.outputPath("wrapped-legacy.png"), fullPage: true });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download share card/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const imagePath = info.outputPath("downloaded-wrapped.png");
  await download.saveAs(imagePath);
  expect((await stat(imagePath)).size).toBeGreaterThan(20_000);
  await page.keyboard.press("Home");
  await expect(page.locator(".wrapped-controls")).toContainText("01");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#wrapped-story .scene-foot")).toContainText("02 / 09");
});
