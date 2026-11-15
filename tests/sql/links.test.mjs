// Linked accounts (Strava, Fitbit, Oura, Whoop, Spotify, GitHub) and proof items,
// run against the real migrations in PGlite. Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./harness.mjs";

let t;
let ana, ben, cat;
let seriesId;
before(async () => {
  t = await createDb();
  [ana, ben, cat] = await Promise.all(["Ana", "Ben", "Cat"].map((n) => t.user(n)));
  const s = (await ana.rpc("create_bet_series", {
    p_title: "Gym month", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000, p_loser_count: 1,
    p_stake_mode: "SHARED_FAVOR_POOL", p_questions: [], p_settings: {},
  }))[0];
  seriesId = s.id;
  await ben.rpc("join_bet_series", { p_series_id: seriesId });
});
after(() => t.close());

const one = async (p) => Object.values((await p)[0])[0];
const status = (who) => one(who.rpc("link_status"));
const link = (who, provider, externalId, tokens = true) =>
  who.rpc("link_save_connection", {
    p_provider: provider, p_external_id: externalId, p_display_name: `${who.name} on ${provider}`,
    p_access_token: tokens ? `access-${who.name}` : null, p_refresh_token: tokens ? `refresh-${who.name}` : null,
    p_expires_at: tokens ? "2030-01-01T00:00:00Z" : null, p_scope: null,
  });
const save = (who, provider, rows) => one(who.rpc("link_save_items", { p_provider: provider, p_rows: JSON.stringify(rows) }));
const proof = (who, user, opts = {}) =>
  one(who.rpc("link_proof_for", { p_series_id: seriesId, p_user_id: user.id, p_since: opts.since ?? null, p_provider: opts.provider ?? null, p_kind: opts.kind ?? null }));
const item = (id, kind, startedAt, value, unit) => ({ id, kind, title: `${kind} ${id}`, value, unit, startedAt, extras: { note: id } });
const rejects = async (p, hint) => {
  await assert.rejects(p, (err) => {
    assert.equal(err.hint, hint, `hint for: ${err.message}`);
    return true;
  });
};

describe("linking", () => {
  test("nothing linked at first", async () => {
    assert.deepEqual(await status(ben), []);
    assert.equal(await one(ben.rpc("link_my_tokens", { p_provider: "strava" })), null);
  });

  test("link several apps; tokens are only readable by their owner", async () => {
    await link(ben, "strava", "200");
    await link(ben, "spotify", "ben-spotify");
    await link(ben, "github", "benhub", false);
    assert.deepEqual((await status(ben)).map((s) => [s.provider, s.displayName, Number(s.items)]), [
      ["github", "Ben on github", 0], ["spotify", "Ben on spotify", 0], ["strava", "Ben on strava", 0],
    ]);
    assert.equal((await one(ben.rpc("link_my_tokens", { p_provider: "strava" }))).accessToken, "access-Ben");
    assert.equal((await one(ben.rpc("link_my_tokens", { p_provider: "github" }))).accessToken, null);
    assert.equal(await one(ana.rpc("link_my_tokens", { p_provider: "strava" })), null);
    await assert.rejects(ana.as("select * from public.linked_accounts"));
    await assert.rejects(ana.as("select * from public.proof_items"));
  });

  test("unknown apps and missing account ids are refused", async () => {
    await rejects(link(ben, "myspace", "1"), "unknown_provider");
    await rejects(link(ben, "fitbit", "  "), "link_failed");
  });

  test("refreshed tokens replace the old ones; a missing new refresh token keeps the old one", async () => {
    await ben.rpc("link_update_tokens", { p_provider: "strava", p_access_token: "new-access", p_refresh_token: null, p_expires_at: "2031-01-01T00:00:00Z" });
    const tok = await one(ben.rpc("link_my_tokens", { p_provider: "strava" }));
    assert.equal(tok.accessToken, "new-access");
    assert.equal(tok.refreshToken, "refresh-Ben");
  });
});

describe("proof", () => {
  test("saving needs a link, and later copies replace earlier ones", async () => {
    await rejects(save(ana, "strava", [item("1", "run", "2026-11-10T07:00:00Z", 5000, "m")]), "link_not_connected");
    assert.equal(await save(ben, "strava", [
      item("1", "run", "2026-11-10T07:00:00Z", 5000, "m"),
      item("2", "ride", "2026-11-11T07:00:00Z", 20000, "m"),
      item("3", "run", "2026-11-12T07:00:00Z", 8000, "m"),
    ]), 3);
    assert.equal(await save(ben, "strava", [item("3", "run", "2026-11-12T07:00:00Z", 10000, "m"), item("1", "run", "2026-11-10T07:00:00Z", 5000, "m")]), 1);
    await save(ben, "spotify", [item("p1", "listen", "2026-11-12T20:00:00Z", 3.5, "min")]);
    const s = (await status(ben)).find((x) => x.provider === "strava");
    assert.equal(Number(s.items), 3);
    assert.ok(s.lastSyncedAt);
  });

  test("series members see each other's proof, filtered by time, app and kind", async () => {
    const all = await proof(ana, ben, { since: "2026-11-11T00:00:00Z" });
    assert.deepEqual(all.linked.map((l) => l.provider), ["github", "spotify", "strava"]);
    assert.deepEqual(all.items.map((i) => `${i.provider}:${i.id}`), ["spotify:p1", "strava:3", "strava:2"]);
    const runs = await proof(ana, ben, { provider: "strava", kind: "run" });
    assert.deepEqual(runs.items.map((i) => [i.id, Number(i.value), i.unit]), [["3", 10000, "m"], ["1", 5000, "m"]]);
    assert.deepEqual(runs.items[0].extras, { note: "3" });
  });

  test("someone with nothing linked has no proof", async () => {
    assert.deepEqual(await proof(ben, ana), { linked: [], items: [] });
  });

  test("people outside the series can't look", async () => {
    await rejects(proof(cat, ben), "not_member");
    await assert.rejects(ana.rpc("link_proof_for", { p_series_id: seriesId, p_user_id: cat.id, p_since: null, p_provider: null, p_kind: null }), (e) => e.hint === "not_member");
  });

  test("an app account someone else has linked is refused, and their link and proof stay", async () => {
    const before = (await proof(ana, ben, { provider: "strava" })).items;
    await assert.rejects(link(cat, "strava", "200"), (e) => e.hint === "link_taken");
    assert.equal((await status(ben)).some((s) => s.provider === "strava"), true);
    assert.deepEqual((await proof(ana, ben, { provider: "strava" })).items, before);
    assert.equal((await status(cat)).some((s) => s.provider === "strava"), false);
  });

  test("linking a different account on the same app starts its proof fresh", async () => {
    await save(ben, "spotify", [item("p2", "listen", "2026-11-13T20:00:00Z", 4, "min")]);
    await link(ben, "spotify", "ben-other-spotify");
    assert.deepEqual((await proof(ana, ben, { provider: "spotify" })).items, []);
    const s = (await status(ben)).find((x) => x.provider === "spotify");
    assert.equal(s.lastSyncedAt, null);
  });

  test("unlinking forgets the link and everything copied from it", async () => {
    await save(ben, "github", [item("e1", "push", "2026-11-13T10:00:00Z", 2, "commits")]);
    await ben.rpc("link_disconnect", { p_provider: "github" });
    assert.equal((await status(ben)).some((s) => s.provider === "github"), false);
    assert.deepEqual((await proof(ana, ben, { provider: "github" })).items, []);
  });
});
