import { test } from "node:test";
import assert from "node:assert/strict";
import { providersForClient, linkGithub, sync, exchange, unlink } from "../../src/server/links.ts";

test("only GitHub is offered and retired providers cannot connect or sync", async () => {
  assert.deepEqual(providersForClient().map((p) => p.id), ["github"]);
  const ctx = { rpc() { throw new Error("Must not read or write storage"); } };
  for (const provider of ["strava", "fitbit", "oura", "whoop", "spotify"]) {
    for (const action of [exchange, sync, unlink]) await assert.rejects(action(ctx, provider), (e) => e.code === "unknown_provider");
  }
});

test("connecting a username keeps GitHub push and merge syncing functional", async (t) => {
  const calls = [];
  const saved = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/users/octocat")) return Response.json({ id: 1, login: "octocat" });
    return Response.json([
      { id: "1", type: "PushEvent", created_at: new Date().toISOString(), repo: { name: "octocat/demo" }, payload: {} },
      { id: "2", type: "PullRequestEvent", created_at: new Date().toISOString(), repo: { name: "octocat/demo" }, payload: { action: "merged", number: 7 } },
    ]);
  });
  const ctx = { body: { username: "@octocat" }, rpc: async (fn, args) => {
    saved.push({ fn, args });
    if (fn === "link_my_tokens") return { displayName: "octocat", lastSyncedAt: null };
    if (fn === "link_save_items") return args.p_rows.length;
    return null;
  } };
  assert.deepEqual(await linkGithub(ctx), { provider: "github", synced: 2 });
  assert.ok(calls.every((url) => url.startsWith("https://api.github.com/users/octocat")));
  const connection = saved.find((c) => c.fn === "link_save_connection").args;
  assert.equal(connection.p_access_token, null);
  assert.equal(connection.p_provider, "github");
  assert.deepEqual(saved.find((c) => c.fn === "link_save_items").args.p_rows.map((r) => r.kind), ["push", "pull_request"]);
});
