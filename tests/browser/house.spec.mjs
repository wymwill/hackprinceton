import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const AUTH = process.env.SUPABASE_URL ?? "http://127.0.0.1:54419";
const API = process.env.API_URL ?? "http://127.0.0.1:3219";
for (const url of [AUTH, API]) if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Browser tests require local test servers.");

async function signup(request, name) {
  const email = `house-browser-${randomUUID()}@example.com`;
  const response = await request.post(`${AUTH}/auth/v1/signup`, { data: { email, password: "local-test-pw", data: { full_name: name } } });
  const session = await response.json();
  expect(session.access_token).toBeTruthy();
  return { email, token: session.access_token };
}
async function api(request, user, method, route, data) {
  const response = await request.fetch(`${API}/api${route}`, { method, headers: { Authorization: `Bearer ${user.token}` }, data });
  const json = await response.json();
  expect(response.ok(), JSON.stringify(json)).toBeTruthy();
  return json.result;
}

test("live wager → commentary; refresh, dismiss, off, failed AI and upset", async ({ page, request }, info) => {
  // No external services (including fonts) participate in local UI verification.
  await page.route("**/*", (route) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const [ana, ben, cat] = await Promise.all(["Piggopie", "Ben", "Cat"].map((name) => signup(request, name)));
  const s = await api(request, ana, "POST", "/series", {
    title: "House browser demo", plannedBetCount: 2, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
    settings: { minContribution: 5 }, bets: [{ question: "Will the demo ship?" }, { question: "Will the underdog win?" }],
  });
  for (const u of [ben, cat]) await api(request, u, "POST", "/series/join", { code: s.invite_code });
  for (const u of [ana, ben, cat]) await api(request, u, "POST", `/series/${s.id}/ready`, { ready: true });
  await api(request, ana, "POST", `/series/${s.id}/start`);
  const current = (await api(request, ana, "GET", "/series/state")).series.find((v) => v.id === s.id);
  const [bet, upset] = current.bets;
  const root = (b) => `/series/${s.id}/bets/${b.id}`;
  for (const u of [ben, cat]) await api(request, u, "POST", `${root(bet)}/wagers`, { amount: 100, outcome: "NO" });
  let commentaryRequests = 0;
  page.on("request", (r) => { if (r.url().endsWith("/commentary")) commentaryRequests++; });
  await page.goto(`/s/${s.id}/bets/${bet.id}`);
  await page.getByLabel("Email", { exact: true }).fill(ana.email);
  await page.getByLabel("Password", { exact: true }).fill("local-test-pw");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.getByRole("heading", { name: "Will the demo ship?" })).toBeVisible();
  await page.getByLabel("Coins", { exact: true }).fill("600");
  await page.getByRole("button", { name: "Bet 600 on YES", exact: true }).click();
  const card = page.getByRole("complementary", { name: "The House commentary" });
  await expect(card).toContainText("Piggopie” now has 600 coins on “YES” — 60% of their starting bankroll");
  await expect(card).toContainText("Bet placed");
  await expect(card).toContainText("Auto commentary");
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: info.outputPath("house-wager.png"), fullPage: true });

  // Await the cached response before refreshing; no additional commentary calls.
  await expect.poll(() => commentaryRequests).toBeGreaterThanOrEqual(1);
  await page.waitForLoadState("networkidle");
  const beforeReload = commentaryRequests;
  await page.reload();
  await expect(card).toContainText("600 coins");
  await page.waitForLoadState("networkidle");
  expect(commentaryRequests).toBe(beforeReload);
  await card.getByRole("button", { name: "Dismiss this House comment" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show commentary" })).toBeVisible();
  await page.getByRole("button", { name: "Show commentary" }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Turn off The House commentary" }).click();
  await page.reload();
  await expect(page.getByText("The House is off.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show commentary" }).click();

  // Fail ONLY commentary networking. A second real wager still succeeds and the
  // deterministic comment updates immediately from the existing state poll.
  await page.route("**/commentary", (route) => route.abort("failed"));
  await page.getByLabel("Coins", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Add 50 on YES", exact: true }).click();
  await expect(card).toContainText("650 coins on “YES” — 65% of their starting bankroll");
  await expect(page.locator(".toast.err")).toHaveCount(0);
  await page.unroute("**/commentary");

  await api(request, ana, "POST", `${root(bet)}/resolve`, { outcome: "YES" });
  await expect(card).toContainText("“YES” wins");
  await expect(card).toContainText("850 coins");
  await api(request, ana, "POST", `${root(upset)}/wagers`, { amount: 50, outcome: "YES" });
  for (const u of [ben, cat]) await api(request, u, "POST", `${root(upset)}/wagers`, { amount: 200, outcome: "NO" });
  await api(request, ana, "POST", `${root(upset)}/resolve`, { outcome: "YES" });
  await page.goto(`/s/${s.id}/bets/${upset.id}`);
  await expect(card).toContainText("Upset");
  await expect(card).toContainText("11% of the pre-settlement pool");
  await expect(card).toContainText("450 coins");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("house-upset.png"), fullPage: true });
});
