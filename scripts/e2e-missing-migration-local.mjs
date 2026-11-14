// What the app says when the database is behind the code: run the stand-in without
// the clan chat migration, and check that chat reports itself (not Bet Series) as
// missing, while friends, clans and bets keep working.
//
//   MIGRATIONS_UP_TO=202611140013 node supabase/tests/local-supabase.mjs
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npx next dev -p 3210
//   API_URL=http://localhost:3210 node scripts/e2e-missing-migration-local.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:3210";
const AUTH = process.env.SUPABASE_URL ?? "http://localhost:54399";
if (!/localhost|127\.0\.0\.1/.test(AUTH)) throw new Error("Point SUPABASE_URL at the local stand-in only.");

const res = await fetch(`${AUTH}/auth/v1/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `ana-${randomUUID().slice(0, 8)}@example.com`, password: "local-test-pw", data: { full_name: "Ana" } }),
});
const token = (await res.json()).access_token;
const api = async (method, path, body) => {
  const r = await fetch(`${API}/api${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};

const clan = await api("POST", "/social/clans", { name: "Gym Rats" });
assert.equal(clan.status, 201, JSON.stringify(clan));
for (const [method, path, fn] of [
  ["GET", `/social/clans/${clan.result.id}/messages`, "clan_messages_page"],
  ["POST", `/social/clans/${clan.result.id}/messages`, "send_clan_message"],
  ["POST", `/social/clans/${clan.result.id}/read`, "mark_clan_chat_read"],
  ["GET", "/social/chat", "clan_chat_status"],
]) {
  const r = await api(method, path, method === "POST" ? { body: "hi", messageId: 1 } : undefined);
  assert.equal(r.status, 503, `${method} ${path}: ${JSON.stringify(r)}`);
  assert.equal(r.error.code, "migrations_missing");
  assert.equal(r.error.message, `Clan chat isn't set up on this database yet (missing: ${fn}). Apply supabase/migrations/202611140013_clan_chat.sql.`);
  assert.doesNotMatch(r.error.message, /Bet Series/);
  console.log(`  ✓ ${method} ${path} → 503: ${r.error.message}`);
}
// Everything else still works on the same database.
assert.equal((await api("GET", "/social/state")).status, 200);
assert.equal((await api("GET", "/series/state")).status, 200);
console.log("  ✓ friends, clans and Bet Series still answer 200");
console.log("\nAll checks passed.");
