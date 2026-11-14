import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { createApp } from "./app.ts";
import type { Series } from "./types.ts";

const dir = mkdtempSync(path.join(os.tmpdir(), "bwf-api-"));
const dataFile = path.join(dir, "db.json");
let server: Server;
let base = "";

before(async () => {
  server = createApp({ dataFile, allowReset: true });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function call(as: string | null, method: string, p: string, body?: unknown) {
  const res = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json", ...(as ? { "X-User-Id": as } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}
const state = async (as: string) => (await call(as, "GET", "/api/state")).json;
const series = async (as: string, id: string): Promise<Series | undefined> => (await state(as)).series.find((s: Series) => s.id === id);
const ok = (r: { status: number; json: any }) => {
  assert.ok(r.status < 300, `${r.status} ${JSON.stringify(r.json)}`);
  return r.json.result;
};

let id = "";
let betId = "";

test("reads fall back to the first player; writes need a known player", async () => {
  const s = await state("");
  assert.equal(s.me, "u1");
  assert.equal(s.users.length, 6);
  assert.deepEqual(s.series.map((x: Series) => x.name), ["Placeholder series"]);
  assert.equal(s.series[0].bets[0].question, "test wip");
  assert.equal((await call(null, "POST", "/api/series", { name: "x" })).status, 401);
  assert.equal((await call("nobody", "POST", "/api/series", { name: "x" })).status, 401);
});

test("creating a series, inviting, joining by code, and who can see it", async () => {
  const created = await call("u1", "POST", "/api/series", {
    name: "API series",
    description: "Placeholder placeholder",
    settings: { mode: "pool", losers: 1, betCount: 2, favorsPerPlayer: 1, exclusivePool: true, withdrawMinutes: 15 },
    invite: ["u2"],
  });
  assert.equal(created.status, 201);
  id = created.json.result.id;
  assert.ok(await series("u2", id), "invited player sees it");
  assert.equal(await series("u3", id), undefined, "others don't");
  ok(await call("u3", "POST", "/api/join", { code: created.json.result.code }));
  ok(await call("u2", "POST", `/api/series/${id}/join`));
  const r = await call("u2", "POST", `/api/series/${id}/kick`, { userId: "u3" });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.message, "Only the host can do that.");
});

test("lobby: favors, ready, bets and start go through the rules", async () => {
  const notYet = await call("u1", "POST", `/api/series/${id}/start`);
  assert.equal(notYet.status, 400);
  for (const u of ["u1", "u2", "u3"]) ok(await call(u, "POST", `/api/series/${id}/favors`, { text: `favor from ${u}` }));
  for (const u of ["u1", "u2", "u3"]) ok(await call(u, "POST", `/api/series/${id}/ready`, { ready: true }));
  betId = ok(await call("u1", "POST", `/api/series/${id}/bets`, { question: "First API bet?" })).id;
  const started = await call("u1", "POST", `/api/series/${id}/start`);
  ok(started);
  const s = started.json.state.series.find((x: Series) => x.id === id);
  assert.equal(s.status, "active");
  assert.equal(s.bets[0].status, "open");
  assert.equal((await call("u2", "POST", `/api/series/${id}/favors`, { text: "too late" })).status, 400);
});

test("wagers: add, no switching, withdraw, and concurrent bets never overspend", async () => {
  ok(await call("u2", "POST", `/api/series/${id}/bets/${betId}/wager`, { side: "no", amount: 100 }));
  ok(await call("u2", "POST", `/api/series/${id}/bets/${betId}/wager`, { side: "no", amount: 50 }));
  assert.equal((await call("u2", "POST", `/api/series/${id}/bets/${betId}/wager`, { side: "yes", amount: 1 })).status, 400);
  ok(await call("u2", "POST", `/api/series/${id}/bets/${betId}/withdraw`));
  const burst = await Promise.all(
    Array.from({ length: 5 }, () => call("u3", "POST", `/api/series/${id}/bets/${betId}/wager`, { side: "no", amount: 300 }))
  );
  assert.equal(burst.filter((r) => r.status === 200).length, 3);
  const s = (await series("u3", id))!;
  assert.equal(s.bets[0].wagers.find((w) => w.userId === "u3")!.amount, 900);
  ok(await call("u1", "POST", `/api/series/${id}/bets/${betId}/wager`, { side: "yes", amount: 300 }));
});

test("host resolves; payouts, a second bet, the end, and favor picks", async () => {
  assert.equal((await call("u2", "POST", `/api/series/${id}/bets/${betId}/resolve`, { outcome: "yes" })).status, 400);
  ok(await call("u1", "POST", `/api/series/${id}/bets/${betId}/resolve`, { outcome: "yes" }));
  let s = (await series("u1", id))!;
  const net = Object.fromEntries(s.bets[0].results!.map((r) => [r.userId, r.net]));
  assert.deepEqual(net, { u3: -900, u1: 900 });
  const b2 = ok(await call("u1", "POST", `/api/series/${id}/bets`, { question: "Second API bet?" })).id;
  ok(await call("u1", "POST", `/api/series/${id}/bets/${b2}/cancel`));
  s = (await series("u1", id))!;
  assert.equal(s.status, "assigning");
  assert.deepEqual(s.finalOrder, ["u1", "u2", "u3"]);
  const favor = s.favors.find((f) => f.authorId === "u2")!;
  assert.equal((await call("u2", "POST", `/api/series/${id}/assignments`, { loserId: "u3", favorId: favor.id })).status, 400);
  ok(await call("u1", "POST", `/api/series/${id}/assignments`, { loserId: "u3", favorId: favor.id }));
  ok(await call("u3", "POST", `/api/series/${id}/favor-done`));
  s = (await series("u3", id))!;
  assert.equal(s.status, "finished");
  assert.deepEqual(s.assignments, [{ loserId: "u3", chooserId: "u1", favorId: favor.id, text: "favor from u2", done: true }]);
});

test("bad requests get readable errors", async () => {
  assert.equal((await call("u1", "GET", "/api/nope")).status, 404);
  const res = await fetch(base + "/api/series", { method: "POST", headers: { "X-User-Id": "u1" }, body: "{not json" });
  assert.equal(res.status, 400);
  assert.equal((await call("u1", "POST", "/api/series/missing/start")).json.error.message, "That series doesn't exist.");
  const user = await call(null, "POST", "/api/users", { name: "New Friend" });
  assert.equal(user.status, 201);
  assert.equal(user.json.state.me, user.json.result.id);
});

test("data survives a restart, and reset puts the seed back", async () => {
  const again = createApp({ dataFile });
  await new Promise<void>((r) => again.listen(0, r));
  const port = (again.address() as AddressInfo).port;
  const s = (await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers: { "X-User-Id": "u1" } })).json()) as { series: Series[] };
  assert.ok(s.series.some((x: Series) => x.id === id));
  again.close();
  ok(await call("u1", "POST", "/api/reset"));
  assert.deepEqual((await state("u1")).series.map((x: Series) => x.name), ["Placeholder series"]);
});
