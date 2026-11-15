// A double click, a double tap, a repeated key press, or a retry after a lost answer
// never places a second wager or creates a second series. Local servers only.
//
// Needs the app and the Supabase stand-in (see tests/e2e/idempotency-local.mjs):
//   API_URL=http://127.0.0.1:3219 SUPABASE_URL=http://127.0.0.1:54419 npm run test:submissions-ui
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const AUTH = process.env.SUPABASE_URL ?? "http://127.0.0.1:54419";
const API = process.env.API_URL ?? "http://127.0.0.1:3219";
const local = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(u).hostname);

async function signUp(name) {
  const email = `submit-${randomUUID().slice(0, 8)}@example.com`;
  const r = await fetch(`${AUTH}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "local-test-pw", data: { full_name: name } }) });
  const s = await r.json();
  if (!s.access_token) throw new Error(`sign up: ${JSON.stringify(s)}`);
  return { name, email, id: s.user.id, token: s.access_token };
}
async function api(who, method, path, body) {
  const r = await fetch(`${API}/api${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${who.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j.error)}`);
  return j.result;
}
async function signIn(page, who) {
  await page.goto("/");
  await page.locator('input[type="email"]').fill(who.email);
  await page.locator('input[type="password"]').fill("local-test-pw");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
}
/** A started MONEY series with one open YES/NO bet; Ana and Ben have 1000 coins each. */
async function liveBet(ana, ben) {
  const s = await api(ana, "POST", "/series", {
    title: `Submit ${randomUUID().slice(0, 4)}`, plannedBetCount: 1, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
    settings: { minContribution: 5, betCreation: "upfront" }, bets: [{ question: "Will it rain?" }],
  });
  await api(ben, "POST", "/series/join", { code: s.invite_code });
  for (const u of [ana, ben]) await api(u, "POST", `/series/${s.id}/ready`, { ready: true });
  await api(ana, "POST", `/series/${s.id}/start`);
  const bet = (await api(ana, "GET", "/series/state")).series.find((x) => x.id === s.id).bets[0];
  return { s, bet };
}
async function mine(who, seriesId) {
  const s = (await api(who, "GET", "/series/state")).series.find((x) => x.id === seriesId);
  return {
    stake: s.bets[0].wagers.find((w) => w.userId === who.id)?.amount ?? 0,
    free: s.standings.find((r) => r.userId === who.id).available,
    wagers: s.bets[0].wagers.length,
  };
}

test.beforeEach(async ({ page }) => {
  test.skip(!local(AUTH) || !local(API), "Local servers only.");
  test.skip(!(await fetch(`${AUTH}/auth/v1/settings`).then(() => true, () => false)), `Needs the local Supabase stand-in at ${AUTH}.`);
  await page.route("**/*", (route) => (local(route.request().url()) ? route.continue() : route.abort()));
});

test("wager: double click / double tap and repeated keys place one wager, with a receipt", async ({ page }, info) => {
  const [ana, ben] = await Promise.all(["Ana", "Ben"].map(signUp));
  const { s, bet } = await liveBet(ana, ben);
  await signIn(page, ana);
  await page.goto(`/s/${s.id}/bets/${bet.id}`);
  const submit = page.locator(".ticket button.submit");
  await expect(submit).toHaveText(/Bet 50 on YES/);

  // Two presses as fast as the device allows.
  if (info.project.name === "mobile") {
    await Promise.all([submit.tap(), submit.tap()]);
  } else {
    await submit.dblclick();
  }
  const receipt = page.locator(".wager-receipt");
  await expect(receipt).toContainText("New wager: 50 on YES.");
  await expect(receipt).toContainText("Your stake on YES: 50");
  await expect(receipt).toContainText("Free coins now: 950");
  expect(await mine(ana, s.id)).toEqual({ stake: 50, free: 950, wagers: 1 });

  // Even three clicks fired in the same instant, before React can re-render, send one request.
  const sent = [];
  page.on("request", (r) => r.method() === "POST" && r.url().includes("/wagers") && sent.push(r.postDataJSON()));
  await page.locator(".quick button", { hasText: /^10$/ }).click();
  await submit.evaluate((b) => { b.click(); b.click(); b.click(); });
  await expect(receipt).toContainText("Added 10 to your YES stake.");
  await expect(receipt).toContainText("Your stake on YES: 60 (was 50)");
  expect(sent.length).toBe(1);

  // Enter and Space together on the focused button.
  await page.locator(".quick button", { hasText: /^100$/ }).click();
  await submit.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(receipt).toContainText("Your stake on YES: 160 (was 60)");
  await page.waitForTimeout(500);
  expect(await mine(ana, s.id)).toEqual({ stake: 160, free: 840, wagers: 1 });
  expect(sent.length).toBe(2);
  await page.screenshot({ path: info.outputPath("wager-receipt.png"), fullPage: true });
});

test("wager: a lost answer shows 'couldn't confirm', and Retry safely doesn't charge twice", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Network failure handling is the same on every screen size.");
  const [ana, ben] = await Promise.all(["Ana", "Ben"].map(signUp));
  const { s, bet } = await liveBet(ana, ben);
  await signIn(page, ana);
  await page.goto(`/s/${s.id}/bets/${bet.id}`);
  // The first wager reaches the server, which commits it, but its answer never reaches the browser.
  let lost = 0;
  const ids = [];
  await page.route("**/wagers", async (route) => {
    ids.push(route.request().postDataJSON().requestId);
    if (lost++ === 0) {
      await route.fetch();
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page.locator(".quick button", { hasText: /^250$/ }).click();
  await page.locator(".ticket button.submit").click();
  await expect(page.getByText("We couldn't confirm your wager of 250 on YES.")).toBeVisible();
  await expect(page.locator(".ticket button.submit")).toHaveText(/Retry safely: 250 on YES/);
  // It did go through on the server: one wager, charged once. The ticket is locked to what was sent.
  expect(await mine(ana, s.id)).toEqual({ stake: 250, free: 750, wagers: 1 });
  await expect(page.locator(".ticket input[type=number]")).toBeDisabled();
  // No "your stake after" estimate while we can't know whether it already counted.
  await expect(page.locator(".ticket .summary")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("wager-unconfirmed.png"), fullPage: true });

  // A reload in between doesn't lose the pending submission.
  await page.reload();
  await expect(page.locator(".ticket button.submit")).toHaveText(/Retry safely: 250 on YES/);
  await page.locator(".ticket button.submit").click();
  const receipt = page.locator(".wager-receipt");
  await expect(receipt).toContainText("New wager: 250 on YES.");
  await expect(receipt).toContainText("already placed, so it wasn't charged again");
  await expect(receipt).toContainText("Free coins now: 750");
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
  expect(await mine(ana, s.id)).toEqual({ stake: 250, free: 750, wagers: 1 });
  await page.screenshot({ path: info.outputPath("wager-retried.png"), fullPage: true });
});

test("wager: a refusal re-enables the button and says why; the next try is a new submission", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Covered on desktop.");
  const [ana, ben] = await Promise.all(["Ana", "Ben"].map(signUp));
  const { s, bet } = await liveBet(ana, ben);
  await signIn(page, ana);
  await page.goto(`/s/${s.id}/bets/${bet.id}`);
  // The server refuses the first try (as it would if the host had just closed betting).
  const ids = [];
  await page.route("**/wagers", async (route) => {
    ids.push(route.request().postDataJSON().requestId);
    if (ids.length === 1) await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "bet_not_open", message: "Betting is closed on this one." } }) });
    else await route.continue();
  });
  const submit = page.locator(".ticket button.submit");
  await submit.click();
  await expect(page.locator(".toast.err")).toContainText("Betting is closed on this one.");
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText(/Bet 50 on YES/);
  await expect(page.getByText("couldn't confirm")).toHaveCount(0);
  expect(await mine(ana, s.id)).toEqual({ stake: 0, free: 1000, wagers: 0 });
  // Trying again is a fresh submission (the refused one changed nothing), and it goes through once.
  await submit.click();
  await expect(page.locator(".wager-receipt")).toContainText("New wager: 50 on YES.");
  expect(ids).toHaveLength(2);
  expect(ids[1]).not.toBe(ids[0]);
  expect(await mine(ana, s.id)).toEqual({ stake: 50, free: 950, wagers: 1 });
});

test("series: a double click and a retry after a lost answer create one series", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Covered on desktop.");
  const [ana] = await Promise.all(["Ana"].map(signUp));
  await signIn(page, ana);
  const count = async (name) => (await api(ana, "GET", "/series/state")).series.filter((x) => x.name === name).length;

  await page.goto("/new");
  await page.getByRole("button", { name: "Detailed setup" }).click();
  await page.locator('input[placeholder="Gym month"]').fill("Double click week");
  await page.getByRole("button", { name: "Create series" }).dblclick();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
  await page.waitForTimeout(700);
  expect(await count("Double click week")).toBe(1);

  // The answer to the first try is lost; Retry safely gets the same series.
  await page.goto("/new");
  await page.getByRole("button", { name: "Detailed setup" }).click();
  await page.locator('input[placeholder="Gym month"]').fill("Lost answer week");
  let tries = 0;
  await page.route("**/api/series", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (tries++ === 0) {
      await route.fetch();
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Create series" }).click();
  await expect(page.getByText("We couldn't confirm the series was created.")).toBeVisible();
  expect(await count("Lost answer week")).toBe(1);
  await page.screenshot({ path: info.outputPath("series-unconfirmed.png"), fullPage: true });
  await page.getByRole("button", { name: "Retry safely" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
  await expect(page.locator(".toast")).toContainText("That series was already created. Here it is.");
  expect(await count("Lost answer week")).toBe(1);

  // Creating another series on purpose still works.
  await page.goto("/new");
  await page.getByRole("button", { name: "Detailed setup" }).click();
  await page.locator('input[placeholder="Gym month"]').fill("Lost answer week");
  await page.getByRole("button", { name: "Create series" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
  expect(await count("Lost answer week")).toBe(2);
});
