// Integration checks against the local Next API + in-memory Supabase only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://127.0.0.1:3219";
const AUTH = process.env.SUPABASE_URL ?? "http://127.0.0.1:54419";
for (const url of [API, AUTH]) if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Wrapped tests require local servers only.");
async function signup(name) {
  const r = await fetch(`${AUTH}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `wrapped-${randomUUID()}@example.com`, password: "local-test-pw", data: { full_name: name } }) });
  const s = await r.json(); assert.ok(s.access_token); return { id: s.user.id, token: s.access_token };
}
async function api(user, method, route, body) {
  const r = await fetch(`${API}/api${route}`, { method, headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
}
const ok = (r) => { assert.ok(r.status < 300, JSON.stringify(r)); return r.result; };
const [ana, ben, cat, outsider] = await Promise.all(["Piggopie", "Ben", "Cat", "Outside"].map(signup));
assert.equal((await api(null, "GET", "/wrapped")).status, 401);
const year = new Date().getUTCFullYear();
assert.equal((await api(ana, "GET", "/wrapped?year=1900")).status, 400);
const series = ok(await api(ana, "POST", "/series", {
  title: "Wrapped test", plannedBetCount: 6, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
  settings: { minContribution: 5, betCreation: "upfront" }, bets: Array.from({ length: 6 }, (_, i) => ({ question: `Wrapped local ${i}` })),
}));
for (const user of [ben, cat]) ok(await api(user, "POST", "/series/join", { code: series.invite_code }));
for (const user of [ana, ben, cat]) ok(await api(user, "POST", `/series/${series.id}/ready`, { ready: true }));
ok(await api(ana, "POST", `/series/${series.id}/start`));
let state = ok(await api(ana, "GET", "/series/state"));
let bets = state.series.find((s) => s.id === series.id).bets;
for (let i = 0; i < bets.length; i++) {
  // Ana wins on three markets and loses on three. Stakes/payouts come from the real settlement RPC.
  await api(ana, "POST", `/series/${series.id}/bets/${bets[i].id}/wagers`, { amount: 100 + i * 10, outcomeId: bets[i].outcomes[0].id });
  await api(ben, "POST", `/series/${series.id}/bets/${bets[i].id}/wagers`, { amount: 100, outcomeId: i < 3 ? bets[i].outcomes[1].id : bets[i].outcomes[0].id });
  await api(cat, "POST", `/series/${series.id}/bets/${bets[i].id}/wagers`, { amount: 100, outcomeId: bets[i].outcomes[1].id });
  const winning = i < 3 ? "YES" : "NO";
  ok(await api(ana, "POST", `/series/${series.id}/bets/${bets[i].id}/resolve`, { outcome: winning }));
}
const recap = ok(await api(ana, "GET", `/wrapped?year=${year}`));
assert.equal(recap.summary.name, "Piggopie");
assert.equal(recap.summary.totalBets, 6);
assert.equal(recap.summary.eligible, 6);
assert.equal(recap.summary.wins, 3);
assert.equal(recap.summary.winRate, 0.5);
assert.ok(recap.summary.best?.net > 0);
assert.ok(recap.summary.worst?.net < 0);
assert.ok(recap.summary.social.nemesis, "six shared settlements qualify social awards");
assert.match(recap.verdict.comment, /Piggopie.*6 bets.*3 eligible wins/);
assert.ok(["fallback", "mock", "openai"].includes(recap.verdict.source));
const outside = ok(await api(outsider, "GET", `/wrapped?year=${year}&userId=${ana.id}`));
assert.equal(outside.summary.totalBets, 0, "recap only includes the authenticated caller's own series membership");
console.log("Wrapped local API integration passed: authentication, year validation, personal records, social thresholds, and grounded House fallback.");
