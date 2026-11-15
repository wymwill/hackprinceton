// Series recap, share card and rematches in the browser. Local servers only.
//
//   API_URL=http://127.0.0.1:3219 SUPABASE_URL=http://127.0.0.1:54419 npm run test:recap-ui
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const AUTH = process.env.SUPABASE_URL ?? "http://127.0.0.1:54419";
const API = process.env.API_URL ?? "http://127.0.0.1:3219";
const local = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(u).hostname);

async function signUp(name) {
  const email = `recap-${randomUUID().slice(0, 8)}@example.com`;
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
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.locator('input[type="email"]').fill(who.email);
  await page.locator('input[type="password"]').fill("local-test-pw");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
}
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

/**
 * A finished MONEY series. Bet 1: Ana alone on YES (100) against 900 on NO, and YES wins:
 * a 10% upset and Ana's best call (100 in, 1,000 back). Bet 2: Cat wins on NO at 40%.
 * Final coins: Ana 1,600, Cat 1,100, Ben 300.
 */
async function finishedSeries(ana, ben, cat, title) {
  const s = await api(ana, "POST", "/series", {
    title, description: "Who reads the room best?", plannedBetCount: 2, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
    settings: { minContribution: 7, betCreation: "upfront", withdrawMinutes: 0, tiebreak: "random", hostPlays: true },
    bets: [{ question: "Will the underdog win?" }, { question: "Will it rain on game day?" }],
  });
  for (const u of [ben, cat]) await api(u, "POST", "/series/join", { code: s.invite_code });
  for (const u of [ana, ben, cat]) await api(u, "POST", `/series/${s.id}/ready`, { ready: true });
  await api(ana, "POST", `/series/${s.id}/start`);
  const bets = (await api(ana, "GET", "/series/state")).series.find((x) => x.id === s.id).bets;
  const w = (u, b, side, amount) => api(u, "POST", `/series/${s.id}/bets/${b.id}/wagers`, { outcomeId: b.outcomes[side].id, amount, requestId: randomUUID() });
  await w(ana, bets[0], 0, 100);
  await w(ben, bets[0], 1, 400);
  await w(cat, bets[0], 1, 500);
  await api(ana, "POST", `/series/${s.id}/bets/${bets[0].id}/resolve`, { outcomeId: bets[0].outcomes[0].id });
  await w(ana, bets[1], 0, 300);
  await w(ben, bets[1], 0, 300);
  await w(cat, bets[1], 1, 400);
  await api(ana, "POST", `/series/${s.id}/bets/${bets[1].id}/resolve`, { outcomeId: bets[1].outcomes[1].id });
  return s;
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.beforeEach(async ({ page }) => {
  test.skip(!local(AUTH) || !local(API), "Local servers only.");
  test.skip(!(await fetch(`${AUTH}/auth/v1/settings`).then(() => true, () => false)), `Needs the local Supabase stand-in at ${AUTH}.`);
  await page.route("**/*", (route) => (local(route.request().url()) ? route.continue() : route.abort()));
});

test("results: an accurate recap, a share card, and a members-only recap link", async ({ page }, info) => {
  const [ana, ben, cat, dee] = await Promise.all(["Ana", "Ben", "Cat", "Dee"].map(signUp));
  const title = `Upset night ${randomUUID().slice(0, 4)}`;
  const s = await finishedSeries(ana, ben, cat, title);
  const state = (await api(ana, "GET", "/series/state")).series.find((x) => x.id === s.id);
  expect(state.status).toBe("finished");
  expect(state.standings.map((r) => [r.userId, r.coins])).toEqual([[ana.id, 1600], [cat.id, 1100], [ben.id, 300]]);

  await signIn(page, ana);
  await page.goto(`/s/${s.id}`);
  const panel = page.locator(".panel.recap");
  await expect(panel).toContainText("2 settled bets");
  await expect(panel).toContainText("Will the underdog win?");
  await expect(panel).toContainText("YES won with only 10% of the 1,000 coins on it.");
  await expect(panel).toContainText("Ana (you) backed YES");
  await expect(panel).toContainText("when only 10% of the coins agreed: 100 in, 1,000 back.");
  await expect(page.getByRole("link", { name: "Play again with this group" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("results-recap.png"), fullPage: true });
  if (info.project.name === "mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    return;
  }

  // The card: a 1080×1350 PNG with the series, standings, upset and best call.
  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download card" }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^bookie-upset-night-[a-z0-9]+-recap\.png$/);
  const saved = info.outputPath("recap-card.png");
  await file.saveAs(saved);
  const buf = await readFile(saved);
  expect(pngSize(buf)).toEqual([1080, 1350]);
  expect(buf.length).toBeGreaterThan(30_000);

  // The recap link: players only.
  await panel.getByRole("button", { name: "Copy recap link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(`${new URL(page.url()).origin}/s/${s.id}/recap`);
  await signIn(page, ben);
  await page.goto(`/s/${s.id}/recap`);
  await expect(page.locator(".panel.recap")).toContainText("YES won with only 10%");
  await expect(page.locator("body")).not.toContainText("Mark done");
  await signIn(page, dee);
  await page.goto(`/s/${s.id}/recap`);
  await expect(page.getByText("This recap isn't available to you")).toBeVisible();
  for (const secret of [title, "Ana", "Will the underdog win?", "1,600"]) await expect(page.locator("main")).not.toContainText(secret);
  await page.screenshot({ path: info.outputPath("recap-not-a-member.png"), fullPage: true });
});

test("rematch: settings carry over, nobody is enrolled, nothing old carries over, and a double click makes one series", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop covers the flow.");
  const [ana, ben, cat] = await Promise.all(["Ana", "Ben", "Cat"].map(signUp));
  const title = `Grudge match ${randomUUID().slice(0, 4)}`;
  const old = await finishedSeries(ana, ben, cat, title);
  const before = (await api(ana, "GET", "/series/state")).series.find((x) => x.id === old.id);

  await signIn(page, ana);
  await page.goto(`/s/${old.id}`);
  await page.getByRole("link", { name: "Play again with this group" }).click();
  await expect(page).toHaveURL(new RegExp(`/new\\?rematch=${old.id}$`));
  const nameBox = page.locator('input[placeholder="Gym month"]');
  await expect(nameBox).toHaveValue(`${title} · Rematch`);
  await expect(page.locator(".notice.ok")).toContainText(`Rematch of ${title}.`);
  await expect(page.locator(".notice.ok")).toContainText("invite Ben and Cat with the invite link or QR code. Nobody joins until they accept.");
  await page.screenshot({ path: info.outputPath("rematch-form.png"), fullPage: true });

  // Editable: rename it, then double-click Create.
  await nameBox.fill(`${title} · Round two`);
  await page.getByRole("button", { name: "Create series" }).dblclick();
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}\?rematchOf=/);
  await page.waitForTimeout(800);
  const all = (await api(ana, "GET", "/series/state")).series;
  const made = all.filter((x) => x.name === `${title} · Round two`);
  expect(made).toHaveLength(1);
  const r = made[0];

  // Settings carried over; everything else fresh.
  expect(r.settings).toEqual(before.settings);
  expect(r.description).toBe(before.description);
  expect(r.status).toBe("lobby");
  expect(r.members.map((m) => m.userId)).toEqual([ana.id]);
  expect([r.bets.length, r.favors.length, r.assignments.length]).toEqual([0, 0, 0]);
  expect(r.standings.every((x) => x.coins === before.settings.startingCoins)).toBe(true);
  expect(r.id).not.toBe(old.id);
  expect(r.code).not.toBe(old.code);
  // The old series is untouched.
  const oldAfter = all.find((x) => x.id === old.id);
  expect(oldAfter.standings).toEqual(before.standings);

  // The lobby lists last time's players to invite, with the usual link and QR code.
  const invite = page.locator(".panel", { hasText: `Invite the ${title} group` });
  await expect(invite).toContainText("2 not joined yet");
  await expect(invite).toContainText("Ben");
  await expect(invite).toContainText("Cat");
  await expect(page.locator(".share-code")).toHaveText(r.code);
  await page.screenshot({ path: info.outputPath("rematch-lobby.png"), fullPage: true });
  // Ben joins on his own; the list updates. Cat still hasn't.
  await api(ben, "POST", "/series/join", { code: r.code });
  await expect(invite).toContainText("1 not joined yet", { timeout: 8000 });
  const after = (await api(ana, "GET", "/series/state")).series.find((x) => x.id === r.id);
  expect(after.members.map((m) => m.userId).sort()).toEqual([ana.id, ben.id].sort());
});

test("rematch from a series you're not in shows nothing of it", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop covers the flow.");
  const [ana, ben, cat, dee] = await Promise.all(["Ana", "Ben", "Cat", "Dee"].map(signUp));
  const title = `Private ${randomUUID().slice(0, 4)}`;
  const old = await finishedSeries(ana, ben, cat, title);
  await signIn(page, dee);
  await page.goto(`/new?rematch=${old.id}`);
  await expect(page.getByText("That series wasn't found.")).toBeVisible();
  await page.getByRole("button", { name: "Detailed setup" }).click();
  await expect(page.locator('input[placeholder="Gym month"]')).toHaveValue("");
  for (const secret of [title, "Ana", "Ben", "Cat"]) await expect(page.locator("main")).not.toContainText(secret);
});
