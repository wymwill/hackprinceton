#!/usr/bin/env node
/**
 * End to end tests for groups, markets, the Bookie, resolution and dares.
 *
 * Starts the production server twice (BWF_SEED=empty, then BWF_SEED=demo) on a
 * fresh data file each time, so run `npm run build` first. The AI mode comes
 * from BOOKIE_AI (default stub). Never calls the real API.
 *
 *   BOOKIE_AI=stub npm run test:e2e
 *   BOOKIE_AI=off npm run test:e2e
 */
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const MODE = process.env.BOOKIE_AI === "off" ? "off" : "stub";
const PORT = Number(process.env.E2E_PORT ?? 3456);
const BASE = `http://localhost:${PORT}`;
const WINDOW = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(".next/BUILD_ID")) {
  console.error("Run `npm run build` first. The tests start the production server.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ""}`);
  }
}

// Demo mode ("Playing as" cookie) unless a phase passes its own auth settings.
const DEMO_AUTH = { BWF_AUTH: "demo", BWF_ALLOW_DEMO_IN_PRODUCTION: "1" };
const NO_AUTH = { BWF_AUTH: "", BWF_ALLOW_DEMO_IN_PRODUCTION: "", SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" };

async function startServer(seed, auth = DEMO_AUTH) {
  const file = path.join(tmpdir(), `bwf-e2e-${process.pid}-${seed}-${auth.BWF_AUTH || (auth.SUPABASE_URL ? "supabase" : "none")}.json`);
  rmSync(file, { force: true });
  const child = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: { ...process.env, ...NO_AUTH, ...auth, BWF_DATA_FILE: file, BWF_SEED: seed, BOOKIE_AI: MODE, BWF_DISPUTE_WINDOW_MS: String(WINDOW), BWF_DARE_WINDOW_MS: String(WINDOW) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    try {
      // Any answer means it's up (signed-out modes answer 401 or 503).
      const r = await fetch(`${BASE}/api/state`);
      if (r.status) return { stop: () => new Promise((res) => (child.on("exit", res), child.kill("SIGTERM"))), log: () => log };
    } catch {}
    await sleep(200);
  }
  child.kill("SIGTERM");
  throw new Error(`Server didn't start:\n${log}`);
}

function as(user) {
  const headers = { cookie: `bwf_user=${user}` };
  const call = async (method, url, body) => {
    const res = await fetch(BASE + url, { method, headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  };
  return {
    state: (group) => call("GET", `/api/state${group ? `?group=${group}` : ""}`),
    post: (url, body) => call("POST", url, body ?? {}),
    patch: (url, body) => call("PATCH", url, body),
  };
}

const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const member = (s, id) => s.group.members.find((m) => m.userId === id);
const market = (s, id) => s.markets.find((m) => m.id === id);

async function waitFor(fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(150);
  }
}

// ---------------------------------------------------------------- empty seed

async function emptyPhase() {
  console.log(`\nGroups and markets (BWF_SEED=empty, BOOKIE_AI=${MODE})`);
  const [p1, p2, p3, p4] = ["p1", "p2", "p3", "p4"].map(as);

  const g1 = await p1.post("/api/groups", { name: "Tokens Club", mode: "tokens", startingBalance: 1000 });
  check("creating a tokens group returns 201", g1.status === 201, g1);
  const g1id = g1.result.id;
  let s = await p1.state(g1id);
  check("the owner starts with 1,000 tokens", member(s, "p1").balance === 1000, s.group?.members);

  const g2 = await p2.post("/api/groups", { name: "Points League", mode: "points" });
  const g2id = g2.result.id;
  s = await p2.state(g2id);
  check("a points group starts at 0", member(s, "p2").balance === 0);

  check("an unknown mode is rejected", (await p1.post("/api/groups", { name: "Bad", mode: "cash" })).status === 400);

  const code = s.group.inviteCode;
  const code1 = (await p1.state(g1id)).group.inviteCode;
  check("invite codes are 8 characters", /^[A-HJ-NP-Z2-9]{8}$/.test(code1), code1);

  // Invite links: /join/<code> previews the group before anyone joins.
  const pv = await p4.state(); // p4 isn't in any group yet
  const preview = await fetch(`${BASE}/api/invites/${code1}`, { headers: { cookie: "bwf_user=p4" } }).then((r) => r.json().then((j) => ({ status: r.status, ...j })));
  check("an invite preview shows the group to a non member", preview.status === 200 && preview.result.name === "Tokens Club" && preview.result.alreadyMember === false && preview.result.members.length === 1, preview);
  check("previewing an invite doesn't join the group", (await p4.state()).groups.length === pv.groups.length);
  const lower = await fetch(`${BASE}/api/invites/${code1.toLowerCase()}`, { headers: { cookie: "bwf_user=p4" } });
  check("invite codes in links aren't case sensitive", lower.status === 200);
  const ownPreview = await fetch(`${BASE}/api/invites/${code1}`, { headers: { cookie: "bwf_user=p1" } }).then((r) => r.json());
  check("the preview knows when you're already in", ownPreview.result?.alreadyMember === true, ownPreview);
  check("a bad invite code gives 404", (await fetch(`${BASE}/api/invites/NOPE2345`)).status === 404);
  check("the join page loads", (await fetch(`${BASE}/join/${code1}`)).status === 200);
  await p3.post("/api/groups/join", { code: code1 });
  const again = await p3.post("/api/groups/join", { code: code1 });
  check("joining twice gives 409 already_member", again.status === 409 && again.error.code === "already_member", again);
  s = await p3.state(g1id);
  check("the join grant is paid once", member(s, "p3").balance === 1000, member(s, "p3"));

  check("a non member gets 404 for a group", (await p4.state(g1id)).status === 404);
  const patch = await p3.patch(`/api/groups/${g1id}`, { name: "Hijacked" });
  check("only the owner can edit a group", patch.status === 403 && patch.error.code === "not_owner", patch);

  // Markets in tokens mode.
  const created = await p1.post(`/api/groups/${g1id}/markets`, { question: "Will it rain on Saturday?", deadline: inHours(24), chance: 70 });
  check("creating a market returns 201", created.status === 201, created);
  const mid = created.result.id;
  s = await p1.state(g1id);
  check("the market opens at the host's chance", market(s, mid).history[0].yes === 70, market(s, mid).history);
  check("mode and balance lock after the first market", s.group.locked === true);
  const locked = await p1.patch(`/api/groups/${g1id}`, { startingBalance: 500 });
  check("changing the currency after the first market gives 409", locked.status === 409 && locked.error.code === "locked", locked);

  const est = await waitFor(async () => market(await p1.state(g1id), mid).bookie);
  check("the Bookie posts an opening estimate", !!est, est);
  check(`the estimate's source is ${MODE === "stub" ? "stub" : "baseline"}`, est?.source === (MODE === "stub" ? "stub" : "baseline"), est?.source);
  s = await p1.state(g1id);
  check("with no trades, the price moves to the Bookie's chance", market(s, mid).chance === est.chance, { chance: market(s, mid).chance, est: est.chance });

  const before = market(s, mid).chance;
  const buy = await p3.post(`/api/markets/${mid}/trade`, { action: "buy", side: "yes", amount: 200 });
  s = await p3.state(g1id);
  const pos = market(s, mid).positions.find((p) => p.userId === "p3");
  check("a buy charges the quoted cost, at most the spend", buy.status === 200 && buy.result.amount <= 200 && member(s, "p3").balance === 1000 - buy.result.amount, buy);
  check("buying Yes raises the chance", market(s, mid).chance > before, { before, after: market(s, mid).chance });
  check("the buyer's contracts show in positions", pos?.yes === buy.result.contracts && pos.yes > 0, pos);

  const tiny = await p3.post(`/api/markets/${mid}/trade`, { action: "buy", side: "yes", amount: 10 });
  check("a spend too small for one contract gives 400 too_small", tiny.status === 400 && tiny.error.code === "too_small", tiny);
  const oversell = await p3.post(`/api/markets/${mid}/trade`, { action: "sell", side: "yes", amount: pos.yes + 1 });
  check("selling more than you hold gives 409", oversell.status === 409, oversell);
  const half = Math.floor(pos.yes / 2);
  const balBefore = member(s, "p3").balance;
  const sell = await p3.post(`/api/markets/${mid}/trade`, { action: "sell", side: "yes", amount: half });
  s = await p3.state(g1id);
  check("selling pays the proceeds into the balance", sell.status === 200 && member(s, "p3").balance === balBefore - sell.result.amount && sell.result.amount < 0, sell);
  check("a non member can't trade", (await p2.post(`/api/markets/${mid}/trade`, { action: "buy", side: "yes", amount: 100 })).status === 404);

  check("only the host can close", (await p3.post(`/api/markets/${mid}/close`)).status === 403);
  await p1.post(`/api/markets/${mid}/close`);
  const late = await p3.post(`/api/markets/${mid}/trade`, { action: "buy", side: "yes", amount: 100 });
  check("buying after close gives 409", late.status === 409, late);

  const odds = await p1.post(`/api/markets/${mid}/odds`);
  s = await p1.state(g1id);
  check("asking the Bookie to re-check stores another estimate", odds.status === 200 && market(s, mid).aiLog.filter((a) => a.kind === "odds").length >= 2, odds);
  check("a second re-check inside the cooldown gives 429", (await p1.post(`/api/markets/${mid}/odds`)).status === 429);

  // Evidence images are served only to members of the market's group.
  const form = new FormData();
  form.append("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "proof.png", { type: "image/png" }));
  form.append("text", "Screenshot");
  const up = await fetch(`${BASE}/api/markets/${mid}/evidence`, { method: "POST", headers: { cookie: "bwf_user=p3" }, body: form });
  const evId = (await up.json()).result;
  check("an image upload returns 201", up.status === 201 && typeof evId === "string", up.status);
  const img = (user) => fetch(`${BASE}/api/evidence/${evId}`, { headers: { cookie: `bwf_user=${user}` } });
  check("a member can load the image", (await img("p3")).status === 200);
  check("a non member gets 404 for the image", (await img("p2")).status === 404);
  check("an unknown evidence id gives 404", (await fetch(`${BASE}/api/evidence/ev_nope`)).status === 404);

  // Concurrency: eight buys at once never overdraw.
  await p4.post("/api/groups/join", { code: code1 });
  const m2 = (await p1.post(`/api/groups/${g1id}/markets`, { question: "Will the bus be late?", deadline: inHours(5) })).result.id;
  const results = await Promise.all(Array.from({ length: 8 }, () => p4.post(`/api/markets/${m2}/trade`, { action: "buy", side: "no", amount: 200 })));
  s = await p4.state(g1id);
  const spent = results.filter((r) => r.status === 200).reduce((a, r) => a + r.result.amount, 0);
  check("eight concurrent buys never overdraw", member(s, "p4").balance >= 0 && member(s, "p4").balance === 1000 - spent, { balance: member(s, "p4").balance, spent });

  // Points mode.
  await p1.post("/api/groups/join", { code });
  await p3.post("/api/groups/join", { code });
  await p4.post("/api/groups/join", { code });
  const pm = (await p2.post(`/api/groups/${g2id}/markets`, { question: "Will the movie be good?", deadline: inHours(4) })).result.id;
  const wrong = await p1.post(`/api/markets/${pm}/trade`, { action: "buy", side: "yes", amount: 100 });
  check("trading in a points group gives 409 wrong_mode", wrong.status === 409 && wrong.error.code === "wrong_mode", wrong);
  await p4.post(`/api/markets/${pm}/pick`, { side: "yes" });
  await p4.post(`/api/markets/${pm}/pick`, { side: "no" });
  await p1.post(`/api/markets/${pm}/pick`, { side: "yes" });
  await p3.post(`/api/markets/${pm}/pick`, { side: "yes" });
  s = await p2.state(g2id);
  const picks = market(s, pm).picks;
  check("changing a pick keeps one pick", picks.filter((p) => p.userId === "p4").length === 1 && picks.find((p) => p.userId === "p4").side === "no", picks);
  check("the points chance is the share of Yes picks", market(s, pm).chance === 67, market(s, pm).chance);
  await p2.post(`/api/markets/${pm}/close`);
  check("picking after close gives 409", (await p1.post(`/api/markets/${pm}/pick`, { side: "no" })).status === 409);
  await p2.post(`/api/markets/${pm}/result`, { outcome: "yes" });
  for (const p of [p1, p3, p4]) await p.post(`/api/markets/${pm}/vote`, { vote: "confirm" });
  s = await p2.state(g2id);
  check("a settled points market pays correct picks max(10, 100 minus side share)", member(s, "p1").points === 33 && member(s, "p4").points === 0, s.group.members.map((m) => [m.userId, m.points]));

  await accessPhase();
}

/** Invite resets, removing members, who gets a vote, and upload limits. */
async function accessPhase() {
  console.log("\nGroup access and voting");
  const [p1, p2, p3, p4] = ["p1", "p2", "p3", "p4"].map(as);
  const gid = (await p1.post("/api/groups", { name: "Access Club", mode: "tokens", startingBalance: 1000 })).result.id;
  const code = (await p1.state(gid)).group.inviteCode;
  await p2.post("/api/groups/join", { code });
  await p3.post("/api/groups/join", { code });

  const notOwner = await p2.post(`/api/groups/${gid}/invite`);
  check("only the owner can make a new invite link", notOwner.status === 403 && notOwner.error.code === "not_owner", notOwner);
  const reset = await p1.post(`/api/groups/${gid}/invite`);
  const fresh = reset.result?.inviteCode;
  check("the owner gets a new invite code", reset.status === 200 && /^[A-HJ-NP-Z2-9]{8}$/.test(fresh) && fresh !== code, reset);
  check("the old code stops working", (await p4.post("/api/groups/join", { code })).status === 404);
  check("and so does the old link's preview", (await fetch(`${BASE}/api/invites/${code}`, { headers: { cookie: "bwf_user=p4" } })).status === 404);

  // p2 hosts a market, and p3 trades on p1's market, before p4 joins.
  const hosted = (await p2.post(`/api/groups/${gid}/markets`, { question: "Will p2 finish the book?", deadline: inHours(24) })).result.id;
  const m = (await p1.post(`/api/groups/${gid}/markets`, { question: "Will the club meet on Friday?", deadline: inHours(24) })).result.id;
  await p3.post(`/api/markets/${m}/trade`, { action: "buy", side: "yes", amount: 100 });
  await p2.post(`/api/markets/${m}/trade`, { action: "buy", side: "yes", amount: 100 });
  check("a late joiner can join with the new code", (await p4.post("/api/groups/join", { code: fresh })).status === 200);
  await p4.post(`/api/markets/${m}/trade`, { action: "buy", side: "no", amount: 100 });
  await p1.post(`/api/markets/${m}/result`, { outcome: "no" });
  let s = await p1.state(gid);
  const voters = market(s, m).proposal?.voters ?? [];
  check("only people in the group when the market opened get a vote", voters.length === 2 && voters.includes("p2") && voters.includes("p3") && !voters.includes("p4"), voters);
  const late = await p4.post(`/api/markets/${m}/vote`, { vote: "confirm" });
  check("a late joiner's vote is refused", late.status === 403 && late.error.code === "not_a_voter", late);

  const del = (who, target) => fetch(`${BASE}/api/groups/${gid}/members/${target}`, { method: "DELETE", headers: { cookie: `bwf_user=${who}` } }).then((r) => r.json().then((j) => ({ status: r.status, ...j })));
  check("only the owner can remove someone", (await del("p3", "p2")).status === 403);
  check("the owner can't remove themselves", (await del("p1", "p1")).status === 409);
  check("removing someone not in the group gives 404", (await del("p1", "nobody")).status === 404);
  const balanceBefore = member(await p2.state(gid), "p2").balance;
  const removed = await del("p1", "p2");
  check("the owner removes a member", removed.status === 200 && removed.result?.removed === "p2", removed);
  check("a removed member loses access to the group", (await p2.state(gid)).status === 404);
  s = await p1.state(gid);
  check("their unsettled markets pass to the owner", market(s, hosted).hostId === "p1", market(s, hosted).hostId);
  check("and they no longer count as a voter", !(market(s, m).proposal?.voters ?? []).includes("p2"), market(s, m).proposal?.voters);
  await p2.post("/api/groups/join", { code: fresh });
  check("rejoining doesn't hand out a second starting grant", member(await p2.state(gid), "p2").balance === balanceBefore, member(await p2.state(gid), "p2"));

  // Uploads: the size is checked before the body is read.
  const big = await fetch(`${BASE}/api/markets/${m}/evidence`, {
    method: "POST",
    headers: { cookie: "bwf_user=p1", "content-type": "multipart/form-data; boundary=x" },
    body: Buffer.alloc(6 * 1024 * 1024),
  });
  check("an upload over the limit is refused before it's read", big.status === 413, big.status);
}

// ---------------------------------------------------------------- demo seed

async function demoPhase() {
  console.log(`\nThe Bookie, resolution and dares (BWF_SEED=demo, BOOKIE_AI=${MODE})`);
  const [alex, sam, priya, marcus, elena, jake] = ["alex", "sam", "priya", "marcus", "elena", "jake"].map(as);
  const G = "demo";
  let s = await alex.state(G);
  check("the demo group has 6 members", s.group?.members.length === 6, s.group?.members.length);
  check("the demo group has at least 10 settled markets", s.markets.filter((m) => m.status === "settled").length >= 10);
  check("the demo has a dare in each column", ["todo", "voting", "done"].every((st) => s.dares.some((d) => d.status === st)), s.dares.map((d) => d.status));

  // The Bookie's opening line on a market about Jake.
  const jm = (await sam.post(`/api/groups/${G}/markets`, { question: "Will Jake make 6 AM leg day on Thursday?", subjectId: "jake", category: "fitness", deadline: inHours(20) })).result.id;
  const est = await waitFor(async () => market(await sam.state(G), jm).bookie);
  check("a market about Jake gets a Bookie estimate within 5s", !!est);
  check("the estimate cites at least one stored market", est?.facts.some((f) => f.marketIds.length > 0), est?.facts);
  s = await sam.state(G);
  check("the price moves to the Bookie's chance", market(s, jm).chance === est?.chance && market(s, jm).history.some((h) => h.source === "bookie"), market(s, jm).history);
  check("Jake's record pulls the chance below even", est?.chance < 50, est?.chance);
  check("the estimate shows in the audit trail", market(s, jm).aiLog.some((a) => a.kind === "odds"));

  // A market traded before the estimate keeps its price.
  const tm = (await sam.post(`/api/groups/${G}/markets`, { question: "Will Priya run a 10K?", subjectId: "priya", category: "fitness", deadline: inHours(20), chance: 80 })).result.id;
  const firstTrade = await priya.post(`/api/markets/${tm}/trade`, { action: "buy", side: "yes", amount: 200 });
  await waitFor(async () => market(await sam.state(G), tm).bookie);
  s = await sam.state(G);
  const tmv = market(s, tm);
  const tradedFirst = Date.parse(firstTrade.result.createdAt) < Date.parse(tmv.bookie.at);
  check("after a trade the Bookie's estimate never moves the price", !tradedFirst || !tmv.history.some((h) => h.source === "bookie"), tmv.history);

  // Resolution.
  const r1 = (await sam.post(`/api/groups/${G}/markets`, { question: "Will Marcus finish his book?", deadline: inHours(10) })).result.id;
  const pb = await priya.post(`/api/markets/${r1}/trade`, { action: "buy", side: "yes", amount: 200 });
  await marcus.post(`/api/markets/${r1}/trade`, { action: "buy", side: "no", amount: 100 });
  check("a non host can't propose", (await priya.post(`/api/markets/${r1}/result`, { outcome: "yes" })).status === 403);
  await sam.post(`/api/markets/${r1}/result`, { outcome: "yes" });
  check("the host can't vote", (await sam.post(`/api/markets/${r1}/vote`, { vote: "confirm" })).status === 403);
  check("a non voter can't vote", (await elena.post(`/api/markets/${r1}/vote`, { vote: "confirm" })).status === 403);
  await priya.post(`/api/markets/${r1}/vote`, { vote: "dispute" });
  await marcus.post(`/api/markets/${r1}/vote`, { vote: "dispute" });
  s = await sam.state(G);
  check("a dispute majority sends it back to closed", market(s, r1).status === "closed" && !market(s, r1).proposal, market(s, r1).status);
  await sam.post(`/api/markets/${r1}/result`, { outcome: "yes" });
  s = await sam.state(G);
  check("a new proposal starts with no votes", Object.keys(market(s, r1).proposal.votes).length === 0);
  check("the host can't re-propose while a vote is live", (await sam.post(`/api/markets/${r1}/result`, { outcome: "no" })).status === 409);
  const priyaBefore = member(s, "priya").balance;
  await marcus.post(`/api/markets/${r1}/vote`, { vote: "dispute" });
  await marcus.post(`/api/markets/${r1}/vote`, { vote: "confirm" });
  await priya.post(`/api/markets/${r1}/vote`, { vote: "confirm" });
  s = await sam.state(G);
  check("when every voter confirms it settles", market(s, r1).status === "settled", market(s, r1).status);
  check("each winning contract pays 100", member(s, "priya").balance === priyaBefore + 100 * pb.result.contracts, { before: priyaBefore, after: member(s, "priya").balance });
  const rc = market(s, r1).receipt;
  check(MODE === "stub" ? "the receipt has a stub roast" : "the receipt has a stock line", MODE === "stub" ? rc.roast?.startsWith("Test stub roast") : rc.roastSource === "stock" && !!rc.roast, rc);
  const paid = rc.results.reduce((a, r) => a + r.payout, 0);
  const took = market(s, r1).positions.reduce((a, p) => a + p.spent, 0);
  check("the house loss stays within 1,733", paid - took <= 1733, { paid, took });

  const r2 = (await jake.post(`/api/groups/${G}/markets`, { question: "Will anyone notice?", deadline: inHours(3) })).result.id;
  await jake.post(`/api/markets/${r2}/result`, { outcome: "no" });
  s = await jake.state(G);
  check("a market with no voters settles on the proposal", market(s, r2).status === "settled");

  const r3 = (await elena.post(`/api/groups/${G}/markets`, { question: "Will Sam bring snacks?", deadline: inHours(3) })).result.id;
  await alex.post(`/api/markets/${r3}/trade`, { action: "buy", side: "yes", amount: 60 });
  await jake.post(`/api/markets/${r3}/trade`, { action: "buy", side: "no", amount: 60 });
  await elena.post(`/api/markets/${r3}/result`, { outcome: "yes" });
  await alex.post(`/api/markets/${r3}/vote`, { vote: "confirm" });
  await sleep(WINDOW + 500);
  s = await elena.state(G);
  check("it settles when the window ends", market(s, r3).status === "settled", market(s, r3).status);

  const balances = (st) => Object.fromEntries(st.group.members.map((m) => [m.userId, m.balance]));
  const before = balances(await alex.state(G));
  const r4 = (await alex.post(`/api/groups/${G}/markets`, { question: "Will the gym be open on the holiday?", deadline: inHours(3), dare: { kind: "preset", text: "50 burpees on camera" } })).result.id;
  await jake.post(`/api/markets/${r4}/trade`, { action: "buy", side: "yes", amount: 150 });
  await sam.post(`/api/markets/${r4}/trade`, { action: "buy", side: "no", amount: 90 });
  await jake.post(`/api/markets/${r4}/trade`, { action: "sell", side: "yes", amount: 1 });
  await alex.post(`/api/markets/${r4}/result`, { outcome: "void" });
  await jake.post(`/api/markets/${r4}/vote`, { vote: "confirm" });
  await sam.post(`/api/markets/${r4}/vote`, { vote: "confirm" });
  s = await alex.state(G);
  check("void returns everyone to their balance before the market", JSON.stringify(balances(s)) === JSON.stringify(before), { before, after: balances(s) });
  check("a void market creates no dares", !s.dares.some((d) => d.marketId === r4));

  // The Bookie's review never moves anything.
  const r5 = (await sam.post(`/api/groups/${G}/markets`, { question: "Did Alex wake up before 7?", deadline: inHours(3) })).result.id;
  await jake.post(`/api/markets/${r5}/trade`, { action: "buy", side: "yes", amount: 100 });
  await sam.post(`/api/markets/${r5}/close`);
  await jake.post(`/api/markets/${r5}/evidence`, { text: "Saw him at the coffee shop at 6:40.", claims: "yes" });
  await alex.post(`/api/markets/${r5}/evidence`, { text: "Alarm screenshot, 6:30.", claims: "yes" });
  const snap = balances(await sam.state(G));
  const rev = await sam.post(`/api/markets/${r5}/review`);
  s = await sam.state(G);
  check("the Bookie's review never changes status or balances", market(s, r5).status === "closed" && JSON.stringify(balances(s)) === JSON.stringify(snap), market(s, r5).status);
  check(
    MODE === "stub" ? "two agreeing items give a recommendation" : "with AI off the review hands it to a human",
    MODE === "stub" ? rev.result?.status === "recommended" && rev.result.outcome === "yes" : rev.result?.status === "needs_human",
    rev
  );
  await marcus.post(`/api/markets/${r5}/evidence`, { text: "He was asleep on FaceTime at 7:10.", claims: "no" });
  const rev2 = await sam.post(`/api/markets/${r5}/review`);
  check("contradicting evidence needs a human", rev2.result?.status === "needs_human", rev2);
  check("evidence isn't accepted while a market is open", (await jake.post(`/api/markets/${jm}/evidence`, { text: "Too early" })).status === 409);

  // Dares: three winners and two losers.
  const d1 = (await jake.post(`/api/groups/${G}/markets`, { question: "Will it snow this week?", deadline: inHours(3), dare: { kind: "preset", text: "Cold shower, filmed" } })).result.id;
  for (const u of [alex, sam, priya]) await u.post(`/api/markets/${d1}/trade`, { action: "buy", side: "yes", amount: 100 });
  for (const u of [marcus, elena]) await u.post(`/api/markets/${d1}/trade`, { action: "buy", side: "no", amount: 100 });
  await jake.post(`/api/markets/${d1}/result`, { outcome: "yes" });
  for (const u of [alex, sam, priya, marcus, elena]) await u.post(`/api/markets/${d1}/vote`, { vote: "confirm" });
  s = await jake.state(G);
  const owed = s.dares.filter((d) => d.marketId === d1);
  check("two losers owe a dare to the three winners", owed.length === 2 && owed.every((d) => d.owedTo.length === 3 && ["marcus", "elena"].includes(d.owedBy)), owed);
  const md = owed.find((d) => d.owedBy === "marcus");
  check("a winner can't post proof", (await alex.post(`/api/dares/${md.id}/proof`, { text: "done" })).status === 403);
  const proof = await marcus.post(`/api/dares/${md.id}/proof`, { text: "Freezing. Video in the chat." });
  check("proof moves the dare to voting", proof.result?.status === "voting", proof);
  check("the loser can't vote on their own dare", (await marcus.post(`/api/dares/${md.id}/vote`, { vote: "approve" })).status === 403);
  await alex.post(`/api/dares/${md.id}/vote`, { vote: "redo" });
  const redo = await sam.post(`/api/dares/${md.id}/vote`, { vote: "redo" });
  check("two of three winners choosing redo sends it back", redo.result?.status === "todo", redo);
  await marcus.post(`/api/dares/${md.id}/proof`, { text: "Longer this time." });
  await alex.post(`/api/dares/${md.id}/vote`, { vote: "approve" });
  const ok = await priya.post(`/api/dares/${md.id}/vote`, { vote: "approve" });
  check("a majority approving marks it done", ok.result?.status === "done", ok);
  await sleep(WINDOW + 500);
  s = await jake.state(G);
  const ed = s.dares.find((d) => d.marketId === d1 && d.owedBy === "elena");
  check("a dare with no proof by the deadline is skipped", ed.status === "skipped", ed);
  const em = member(s, "elena");
  check("the leaderboard counts dares done and skipped", em.dares.skipped === s.dares.filter((d) => d.owedBy === "elena" && d.status === "skipped").length && member(s, "marcus").dares.done === s.dares.filter((d) => d.owedBy === "marcus" && d.status === "done").length, em.dares);

  const w = (await jake.post(`/api/groups/${G}/markets`, { question: "Will Sam finish first?", deadline: inHours(3), dare: { kind: "wheel" } })).result.id;
  await sam.post(`/api/markets/${w}/trade`, { action: "buy", side: "yes", amount: 100 });
  await jake.post(`/api/markets/${w}/result`, { outcome: "no" });
  await sam.post(`/api/markets/${w}/vote`, { vote: "confirm" });
  s = await jake.state(G);
  check("the wheel picks one of the group's presets", s.group.darePresets.includes(market(s, w).receipt.dareText), market(s, w).receipt.dareText);

  const sug = await sam.post(`/api/groups/${G}/dare-suggestion`, { question: "Will Jake make leg day?" });
  check(MODE === "stub" ? "the Bookie suggests a stub dare" : "with AI off the suggestion is a preset", MODE === "stub" ? sug.result?.text.startsWith("Test stub dare") : s.group.darePresets.includes(sug.result?.text), sug);
}

const empty = await startServer("empty");
try {
  await emptyPhase();
} catch (err) {
  failed++;
  console.error(err, empty.log());
} finally {
  await empty.stop();
}
const demo = await startServer("demo");
try {
  await demoPhase();
} catch (err) {
  failed++;
  console.error(err, demo.log());
} finally {
  await demo.stop();
}
// ---------------------------------------------------------------- real sign-in

/**
 * Supabase mode, end to end, without a Supabase project: a tiny server
 * publishes a test signing key at /auth/v1/.well-known/jwks.json, and the
 * tests sign ES256 session tokens with it, exactly as Supabase Auth would.
 * The app verifies them through @supabase/ssr's getClaims().
 */
const JWKS_PORT = PORT + 1;
const SUPABASE_URL = `http://127.0.0.1:${JWKS_PORT}`;
const COOKIE = "sb-127-auth-token";
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = createHash("sha256").update(publicKey.export({ format: "der", type: "spki" })).digest("hex").slice(0, 16);
const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig" }] };
const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

function token(sub, name, { key = privateKey, expiresIn = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", typ: "JWT", kid: KID });
  const body = b64({ sub, aud: "authenticated", role: "authenticated", iat: now, exp: now + expiresIn, email: `${sub}@example.com`, user_metadata: { full_name: name } });
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

/** The session cookie @supabase/ssr reads, for a token. */
function sessionCookie(access_token, expiresIn = 3600) {
  const session = { access_token, token_type: "bearer", expires_in: expiresIn, expires_at: Math.floor(Date.now() / 1000) + expiresIn, refresh_token: "test-refresh", user: { id: "x" } };
  return `${COOKIE}=base64-${b64(session)}`;
}

function signedIn(cookie) {
  const call = async (method, url, body, extra = "") => {
    const res = await fetch(BASE + url, { method, redirect: "manual", headers: { cookie: [cookie, extra].filter(Boolean).join("; "), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, location: res.headers.get("location"), ...json };
  };
  return { get: (url, extra) => call("GET", url, undefined, extra), post: (url, body) => call("POST", url, body ?? {}) };
}

async function supabasePhase() {
  console.log("\nSign-in with Supabase (test signing key, BWF_SEED=demo)");
  const anon = signedIn("");
  const ana = signedIn(sessionCookie(token("auth-ana", "Ana Lopez")));
  const ben = signedIn(sessionCookie(token("auth-ben", "Ben Okafor")));

  check("signed out, the API answers 401", (await anon.get("/api/state")).status === 401);
  check("the old Playing as cookie alone is ignored", (await anon.get("/api/state", "bwf_user=sam")).status === 401);
  check("Playing as can't be switched", (await anon.post("/api/session", { userId: "sam" })).status === 403);
  const forged = signedIn(sessionCookie(token("auth-ana", "Ana Lopez", { key: other.privateKey })));
  check("a token signed with another key is refused", (await forged.get("/api/state")).status === 401);
  const expired = signedIn(sessionCookie(token("auth-ana", "Ana Lopez", { expiresIn: -60 }), -60));
  check("an expired token is refused", (await expired.get("/api/state")).status === 401);

  let a = await ana.get("/api/state");
  check("a new account gets its own user", a.status === 200 && a.me.startsWith("u_") && a.users.length === 1 && a.users[0].name === "Ana Lopez", a);
  check("it starts in no groups", a.groups?.length === 0, a.groups);
  check("the demo group's people are invisible", !a.users.some((u) => ["Sam", "Jake"].includes(u.name.split(" ")[0])), a.users);
  check("the auth mode is reported", a.auth?.mode === "supabase", a.auth);
  const anaId = a.me;
  check("the same account maps to the same user", (await ana.get("/api/state")).me === anaId);
  check("a Playing as cookie can't override the session", (await ana.get("/api/state", "bwf_user=sam")).me === anaId);
  check("you can't read a group you're not in", (await ana.get("/api/state?group=demo")).status === 404);

  const g = await ana.post("/api/groups", { name: "Ana's Crew", mode: "tokens", startingBalance: 500 });
  check("a signed-in user can create a group", g.status === 201, g);
  const gid = g.result.id;
  const code = (await ana.get(`/api/state?group=${gid}`)).group.inviteCode;

  let b = await ben.get("/api/state");
  check("a second account is a different user", b.status === 200 && b.me !== anaId && b.users.length === 1, b);
  check("they can't see each other before sharing a group", !b.users.some((u) => u.id === anaId));
  check("nor read each other's group", (await ben.get(`/api/state?group=${gid}`)).status === 404);
  check("joining goes through the invite", (await ben.post("/api/groups/join", { code })).status === 200);
  b = await ben.get(`/api/state?group=${gid}`);
  check("after joining, each sees the other", b.users.some((u) => u.id === anaId) && b.users.length === 2, b.users);
  a = await ana.get(`/api/state?group=${gid}`);
  check("and still nobody from groups they aren't in", a.users.length === 2, a.users);

  const form = new FormData();
  form.append("file", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], { type: "image/png" }), "x.png");
  const up = await fetch(`${BASE}/api/markets/m_x/evidence`, { method: "POST", body: form });
  check("a signed-out upload is refused before it's read", up.status === 401, up.status);

  const page = await anon.get("/g/demo");
  check("signed out, pages redirect to sign in", page.status === 307 && page.location?.endsWith("/login?next=%2Fg%2Fdemo"), page);
  check("signed in, pages load", (await ana.get(`/g/${gid}`)).status === 200);
  const login = await ana.get("/login?next=%2Fg%2Fdemo");
  check("signed in, /login goes back to where you were going", login.status === 307 && login.location?.endsWith("/g/demo"), login);
  check("the login page loads signed out", (await anon.get("/login")).status === 200);
  const evil = await anon.get("/auth/callback?error=access_denied&next=%2F%2Fevil.example");
  check("the callback never redirects off site", evil.status === 307 && new URL(evil.location).origin === BASE && !evil.location.includes("next=%2F%2Fevil"), evil);
  check("install files load signed out", (await anon.get("/manifest.webmanifest")).status === 200);
  check("signing out needs a POST", (await ana.get("/auth/signout")).status === 405);
  const out = await fetch(`${BASE}/auth/signout`, { method: "POST", redirect: "manual", headers: { cookie: sessionCookie(token("auth-ana", "Ana Lopez")) } });
  const cleared = out.headers.getSetCookie().some((c) => c.startsWith(`${COOKIE}=;`) || (c.startsWith(`${COOKIE}=`) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)));
  check("signing out clears the session and goes to /login", out.status === 303 && out.headers.get("location")?.endsWith("/login") && cleared, out.headers.getSetCookie());
}

async function demoInProductionPhase() {
  console.log("\nBWF_AUTH=demo in a production build, without the opt-in");
  const anon = signedIn("");
  const s = await anon.get("/api/state", "bwf_user=sam");
  check("demo mode is ignored: the API refuses instead of trusting the cookie", s.status === 503, s);
  const res = await fetch(`${BASE}/api/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "elena" }) });
  check("and nobody can pick who they play as", res.status === 403, res.status);
}

async function unconfiguredPhase() {
  console.log("\nNo sign-in configured and no demo mode");
  const anon = signedIn("");
  const s = await anon.get("/api/state", "bwf_user=sam");
  check("the API refuses instead of guessing who you are", s.status === 503 && s.error?.code === "auth_not_configured", s);
  const page = await anon.get("/g/demo");
  check("pages go to the login page", page.status === 307 && page.location?.includes("/login"), page);
  const html = await fetch(`${BASE}/login`).then((r) => r.text());
  check("which explains the setup", html.includes("SUPABASE_URL"));
  check("and shows the Google button, turned off until keys are added", /<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Continue with Google/s.test(html));
  check("with no Playing as switcher", !html.includes("Playing as"));
}

const keyServer = createServer((req, res) => {
  if (req.url === "/auth/v1/.well-known/jwks.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(jwks));
  } else {
    res.writeHead(404).end();
  }
});
await new Promise((r) => keyServer.listen(JWKS_PORT, "127.0.0.1", r));
const supa = await startServer("demo", { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" });
try {
  await supabasePhase();
} catch (err) {
  failed++;
  console.error(err, supa.log());
} finally {
  await supa.stop();
  keyServer.close();
}
const none = await startServer("demo", {});
try {
  await unconfiguredPhase();
} catch (err) {
  failed++;
  console.error(err, none.log());
} finally {
  await none.stop();
}

const prodDemo = await startServer("demo", { BWF_AUTH: "demo" });
try {
  await demoInProductionPhase();
} catch (err) {
  failed++;
  console.error(err, prodDemo.log());
} finally {
  await prodDemo.stop();
}

console.log(`\n${passed} passed, ${failed} failed (BOOKIE_AI=${MODE})`);
process.exit(failed ? 1 : 0);
