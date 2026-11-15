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

  await page.keyboard.press("ArrowRight");
  const hero = page.locator(".number-hero strong [aria-hidden=true]");
  await expect(hero).toHaveText("18", { timeout: 4000 });
  expect(await hero.evaluate((n) => parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThan(80);
  for (let i = 1; i < 4; i++) await page.keyboard.press("ArrowRight");
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

// Signed in for real (local stand-in only): the private story shows this account's records, never another's.
const AUTH = process.env.SUPABASE_URL ?? "http://127.0.0.1:54419";
const API = process.env.API_URL ?? "http://127.0.0.1:3219";
const local = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(u).hostname);

async function signUp(name) {
  const email = `wrapped-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const r = await fetch(`${AUTH}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "local-test-pw", data: { full_name: name } }) });
  const s = await r.json();
  if (!s.access_token) throw new Error(`sign up failed: ${JSON.stringify(s)}`);
  return { name, email, id: s.user.id, token: s.access_token };
}
async function api(user, method, path, body) {
  const r = await fetch(`${API}/api${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j.error)}`);
  return j.result;
}
async function signIn(page, user) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill("local-test-pw");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.getByRole("link", { name: /Edit your profile|Edit profile/ }).first()).toBeVisible();
}

test("signed-in story shows only your own records, an empty year, and a load error", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Account flow runs once; layout is covered by the demo test on both sizes.");
  test.skip(!local(AUTH) || !local(API), "Signed-in checks only run against local servers.");
  test.skip(!(await fetch(`${AUTH}/auth/v1/settings`).then(() => true, () => false)), `Needs the local Supabase stand-in at ${AUTH}.`);
  await page.route("**/*", (route) => (local(route.request().url()) ? route.continue() : route.abort()));

  const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
  const [ana, ben, dee] = await Promise.all([`Ana ${tag}`, `Ben ${tag}`, `Dee ${tag}`].map(signUp));
  // Ana bets 100 on YES each time; Ben 60 on NO. Ana wins two of three: +60 +60 −100 = +20.
  const s = await api(ana, "POST", "/series", {
    title: `Wrapped UI ${tag}`, plannedBetCount: 3, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
    settings: { minContribution: 5, betCreation: "upfront" }, bets: [0, 1, 2].map((i) => ({ question: `Wrapped UI bet ${i}` })),
  });
  await api(ben, "POST", "/series/join", { code: s.invite_code });
  for (const u of [ana, ben]) await api(u, "POST", `/series/${s.id}/ready`, { ready: true });
  await api(ana, "POST", `/series/${s.id}/start`);
  const bets = (await api(ana, "GET", "/series/state")).series.find((x) => x.id === s.id).bets;
  for (const [i, b] of bets.entries()) {
    await api(ana, "POST", `/series/${s.id}/bets/${b.id}/wagers`, { outcomeId: b.outcomes[0].id, amount: 100 });
    await api(ben, "POST", `/series/${s.id}/bets/${b.id}/wagers`, { outcomeId: b.outcomes[1].id, amount: 60 });
    await api(ana, "POST", `/series/${s.id}/bets/${b.id}/resolve`, { outcome: i === 1 ? "NO" : "YES" });
  }
  const mine = (await api(ana, "GET", "/wrapped")).summary;
  const bens = (await api(ben, "GET", "/wrapped")).summary;
  expect([mine.totalBets, mine.totalWagered, mine.net]).toEqual([3, 300, 20]);
  expect(bens.totalWagered).toBe(180);

  // Profile → Your Alea Wrapped, signed in as Ana.
  await signIn(page, ana);
  await page.goto("/profile");
  await page.getByRole("link", { name: /Your Alea Wrapped/ }).click();
  await expect(page).toHaveURL(/\/wrapped$/);
  await expect(page.locator(".opening-byline")).toContainText(`${ana.name}, every bet left a story.`);
  await expect(page.getByText("DEMO MODE", { exact: true })).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  const numbers = page.locator("#wrapped-story");
  await expect(numbers).toContainText("BETS PLACED");
  // The big number counts up on screen (aria-hidden) and has the final value for screen readers.
  await expect(numbers.locator(".number-hero strong [aria-hidden=true]")).toHaveText("3", { timeout: 4000 });
  await expect(numbers.locator(".number-hero strong .wrapped-sr-only")).toHaveText("3");
  await expect(numbers).toContainText("300");
  // The count is the slide's headline: it must render large, not at the label's size.
  expect(await numbers.locator(".number-hero strong [aria-hidden=true]").evaluate((n) => parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThan(80);
  await expect(numbers).toContainText("+20");
  await expect(page.locator("body")).not.toContainText(ben.name + ", every bet");
  await expect(page.locator("body")).not.toContainText("180");
  await page.waitForTimeout(650);
  await page.screenshot({ path: info.outputPath("wrapped-signed-in-numbers.png"), fullPage: true });

  // A brand-new account gets the empty story, not someone else's or the demo's.
  await signIn(page, dee);
  await page.goto("/wrapped");
  await expect(page.locator(".opening-byline")).toContainText(`${dee.name}, every bet left a story.`);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#wrapped-story")).not.toContainText("BETS PLACED");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".archetype-title")).toHaveText("THE FRESH ACCOUNT");
  await page.waitForTimeout(650);
  await page.screenshot({ path: info.outputPath("wrapped-signed-in-empty.png"), fullPage: true });

  // When the recap can't load, the story says so and offers a retry.
  await page.route("**/api/wrapped**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "internal", message: "boom" } }) }));
  await page.goto("/wrapped");
  await expect(page.getByText("Your recap is taking a minute.")).toBeVisible();
  await expect(page.getByText("We couldn't load your private recap. Try again in a moment.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // The way out stays in the corner, as on the story.
  const exit = await page.getByRole("link", { name: "Back to profile" }).boundingBox();
  expect(exit.y).toBeLessThan(60);
  expect(exit.x + exit.width).toBeGreaterThan(page.viewportSize().width - 80);
  await page.screenshot({ path: info.outputPath("wrapped-signed-in-error.png"), fullPage: true });
});
