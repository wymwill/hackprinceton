// Scheduled closing and reminders in the browser. Local servers only.
//
//   API_URL=http://127.0.0.1:3219 SUPABASE_URL=http://127.0.0.1:54419 npm run test:deadlines-ui
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const AUTH = process.env.SUPABASE_URL ?? "http://127.0.0.1:54419";
const API = process.env.API_URL ?? "http://127.0.0.1:3219";
const local = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(u).hostname);

async function signUp(name) {
  const email = `deadline-${randomUUID().slice(0, 8)}@example.com`;
  const r = await fetch(`${AUTH}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "local-test-pw", data: { full_name: name } }) });
  const s = await r.json();
  if (!s.access_token) throw new Error(`sign up: ${JSON.stringify(s)}`);
  return { name, email, id: s.user.id, token: s.access_token };
}
async function api(who, method, path, body) {
  const r = await fetch(`${API}/api${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${who.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json();
  return { ok: r.ok, status: r.status, result: j.result, error: j.error };
}
const must = async (p) => {
  const r = await p;
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.result;
};
async function signIn(page, who) {
  await page.goto("/");
  await page.locator('input[type="email"]').fill(who.email);
  await page.locator('input[type="password"]').fill("local-test-pw");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
}
/** A running series: host plays, plus one player. */
async function liveSeries(host, player) {
  const s = await must(api(host, "POST", "/series", {
    title: `Deadlines ${randomUUID().slice(0, 4)}`, plannedBetCount: 6, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
    settings: { minContribution: 5, betCreation: "during" },
  }));
  await must(api(player, "POST", "/series/join", { code: s.invite_code }));
  for (const u of [host, player]) await must(api(u, "POST", `/series/${s.id}/ready`, { ready: true }));
  await must(api(host, "POST", `/series/${s.id}/start`));
  return s;
}
const betIn = async (who, sid, question) => (await must(api(who, "GET", "/series/state"))).series.find((x) => x.id === sid).bets.find((b) => b.question === question);

test.use({ timezoneId: "Asia/Tokyo" });
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Desktop covers the flows; the deadline controls are plain form fields.");
  test.skip(!local(AUTH) || !local(API), "Local servers only.");
  test.skip(!(await fetch(`${AUTH}/auth/v1/settings`).then(() => true, () => false)), `Needs the local Supabase stand-in at ${AUTH}.`);
  await page.route("**/*", (route) => (local(route.request().url()) ? route.continue() : route.abort()));
});

test("the host picks a closing time in local time; it's stored as that exact instant and shown with a countdown", async ({ page }, info) => {
  const [host, player] = await Promise.all(["Hana", "Pia"].map(signUp));
  const s = await liveSeries(host, player);
  await signIn(page, host);
  await page.goto(`/s/${s.id}`);
  await page.getByRole("button", { name: "+ New bet" }).click();
  await page.locator(".modal textarea").fill("Will the train be on time?");
  // 45 minutes from now, typed as Tokyo wall-clock time.
  const target = new Date(Date.now() + 45 * 60_000);
  target.setSeconds(0, 0);
  const tokyo = new Date(target.getTime() + 9 * 3_600_000).toISOString().slice(0, 16);
  await page.getByLabel("Closing time").fill(tokyo);
  await expect(page.locator(".modal")).toContainText("Betting closes on its own at this time (Asia/Tokyo)");
  await page.getByRole("button", { name: "Open bet" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);

  const bet = await betIn(host, s.id, "Will the train be on time?");
  expect(Date.parse(bet.closesAt)).toBe(target.getTime());
  await page.goto(`/s/${s.id}/bets/${bet.id}`);
  await expect(page.locator(".bhead .pill")).toHaveText(/Closing soon/i);
  const deadline = page.locator(".bhead .deadline");
  await expect(deadline).toContainText("Closes");
  await expect(deadline).toContainText(/4\d:\d\d left/);
  await page.screenshot({ path: info.outputPath("closing-soon.png"), fullPage: true });

  // A closing time in the past can't be picked.
  await page.goto(`/s/${s.id}`);
  await page.getByRole("button", { name: "+ New bet" }).click();
  await page.locator(".modal textarea").fill("Already over?");
  await page.getByLabel("Closing time").fill(new Date(Date.now() + 9 * 3_600_000 - 3_600_000).toISOString().slice(0, 16));
  await expect(page.locator(".modal")).toContainText("Pick a closing time at least a minute from now.");
  await expect(page.getByRole("button", { name: "Open bet" })).toBeDisabled();
});

test("at the deadline the ticket closes by itself, and the server refuses a late wager", async ({ page }, info) => {
  const [host, player] = await Promise.all(["Hal", "Pat"].map(signUp));
  const s = await liveSeries(host, player);
  const bet = await must(api(host, "POST", `/series/${s.id}/bets`, { question: "Snow before noon?", closesAt: new Date(Date.now() + 8000).toISOString() }));
  await signIn(page, player);
  await page.goto(`/s/${s.id}/bets/${bet.id}`);
  await expect(page.locator(".ticket button.submit")).toBeVisible();
  await expect(page.locator(".bhead .deadline")).toContainText(/0:0\d left/);
  // Wait out the deadline without touching the page.
  await expect(page.getByText(/Betting closed at/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".ticket button.submit")).toHaveCount(0);
  await expect(page.locator(".bhead .pill")).toHaveText(/Betting locked/i);
  await page.screenshot({ path: info.outputPath("closed-at-deadline.png"), fullPage: true });
  // Even if a stale screen sent one, the server says no.
  const outcomes = (await betIn(player, s.id, "Snow before noon?")).outcomes;
  const late = await api(player, "POST", `/series/${s.id}/bets/${bet.id}/wagers`, { outcomeId: outcomes[0].id, amount: 10, requestId: randomUUID() });
  expect([late.status, late.error.code]).toEqual([409, "bet_not_open"]);
});

test("reminders: opt in on Profile, see them in Your moves once, and they clear when done", async ({ page }, info) => {
  const [host, player] = await Promise.all(["Hugo", "Peg"].map(signUp));
  const s = await liveSeries(host, player);
  const bet = await must(api(host, "POST", `/series/${s.id}/bets`, { question: "Pizza on Friday?", closesAt: new Date(Date.now() + 3 * 3_600_000).toISOString() }));
  await signIn(page, player);

  // Off by default: the move is listed, without a reminder.
  await page.goto("/");
  const move = page.locator(".move", { hasText: "Pizza on Friday?" });
  await expect(move).toBeVisible();
  await expect(move.locator(".pill.reminder")).toHaveCount(0);

  await page.goto("/profile");
  const box = page.getByLabel(/Bets closing soon/);
  // Disabled until your saved settings have loaded, so nothing is toggled from a guess.
  await expect(box).toBeEnabled();
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  await page.reload();
  await expect(page.getByLabel(/Bets closing soon/)).toBeChecked();
  await page.screenshot({ path: info.outputPath("reminder-settings.png"), fullPage: true });

  await page.goto("/");
  await expect(move.locator(".pill.reminder")).toBeVisible();
  await expect(page.locator(".panel", { hasText: "Your moves" }).locator(".pright")).toContainText("1 new reminder");
  await expect(move).toContainText("closes");
  await page.screenshot({ path: info.outputPath("your-moves-reminder.png"), fullPage: true });
  // Seen → read (still listed until done).
  await expect(move.locator(".pill.reminder.unread")).toHaveCount(0, { timeout: 8000 });
  const n1 = await must(api(player, "GET", "/notifications"));
  expect(n1.notifications.filter((x) => x.refId === bet.id).map((x) => x.read)).toEqual([true]);

  // Doing it clears the reminder.
  await page.goto(`/s/${s.id}/bets/${bet.id}`);
  await page.locator(".ticket button.submit").click();
  await expect(page.locator(".wager-receipt")).toBeVisible();
  const n2 = await must(api(player, "GET", "/notifications"));
  expect(n2.notifications.filter((x) => x.refId === bet.id)).toEqual([]);
  await page.goto("/");
  await expect(page.locator(".move", { hasText: "Pizza on Friday?" })).toHaveCount(0);
});
