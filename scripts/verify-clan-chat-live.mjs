// Checks clan chat on the REAL Supabase project, after migration 0013 is applied:
// two members exchange messages live over Supabase Realtime, an outsider gets
// nothing, history persists, deleting and leaving behave.
//
// It creates three temporary Auth users (like scripts/e2e-series.mjs, with the
// secret key in .supabase-test-secret), a temporary clan, and a few messages,
// and removes all of them at the end. It never touches anyone else's data.
//
//   node scripts/verify-clan-chat-live.mjs --yes
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--yes")) {
  console.error("This writes temporary users and messages to the real Supabase project (and removes them after).\nRun with --yes to go ahead.");
  process.exit(2);
}
const env = Object.fromEntries((await readFile(".env.local", "utf8")).split(/\r?\n/).filter((x) => x && !x.startsWith("#")).map((line) => {
  const i = line.indexOf("=");
  return [line.slice(0, i), line.slice(i + 1)];
}));
const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = (await readFile(".supabase-test-secret", "utf8").catch(() => "")).trim();
if (!url || !anon || !secret) throw new Error("Configure .env.local and .supabase-test-secret first.");

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const users = [];
const checks = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, msg) => {
  if (!ok) throw new Error(`FAILED: ${msg}`);
  checks.push(msg);
  console.log(`  ✓ ${msg}`);
};
async function until(what, fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
async function rpc(who, fn, args = {}) {
  const { data, error } = await who.client.rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { hint: error.hint, code: error.code });
  return data;
}
async function makeUser(label) {
  const email = `chat-check-${label}-${suffix}@example.com`;
  const password = `T-${randomUUID()}-aA9!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Chat check ${label}`, chat_check: true } });
  if (error) throw new Error(`Could not create a temporary user: ${error.message}`);
  users.push(data.user.id);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`Could not sign in the temporary user: ${e2.message}`);
  return { label, id: data.user.id, client };
}
function listen(who, clanId) {
  const got = [];
  let status = "";
  const ch = who.client
    .channel(`chat-check-${who.label}-${suffix}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "clan_messages", filter: `clan_id=eq.${clanId}` }, (p) => got.push(p))
    .subscribe((s) => (status = s));
  return { got, ready: () => until(`${who.label} to subscribe`, () => status === "SUBSCRIBED"), stop: () => who.client.removeChannel(ch) };
}

const members = [];
try {
  console.log(`Clan chat on ${new URL(url).host}`);
  const [a, b, c] = [await makeUser("a"), await makeUser("b"), await makeUser("c")];
  members.push(a, b);
  const clan = await rpc(a, "create_clan", { p_name: `Chat check ${suffix}` });
  await rpc(b, "join_clan", { p_code: clan.code });
  const start = await rpc(a, "clan_messages_page", { p_clan_id: clan.id });
  check(start.messages.some((m) => m.event === "member_joined"), "a new clan has a chat, and joining is announced in it");

  const [la, lb, lc] = [listen(a, clan.id), listen(b, clan.id), listen(c, clan.id)];
  await Promise.all([la.ready(), lb.ready(), lc.ready()]);
  const t0 = Date.now();
  const m1 = await rpc(a, "send_clan_message", { p_clan_id: clan.id, p_body: "hello from A 👋", p_client_id: randomUUID() });
  await until("B to receive A's message live", () => lb.got.some((p) => Number(p.new?.id) === m1.id));
  check(true, `B received A's message live over Realtime in ${Date.now() - t0} ms`);
  const m2 = await rpc(b, "send_clan_message", { p_clan_id: clan.id, p_body: "hi A\nsecond line" });
  await until("A to receive B's reply live", () => la.got.some((p) => Number(p.new?.id) === m2.id));
  check(true, "A received B's multiline reply live");
  await sleep(1500);
  check(lc.got.length === 0, "an outsider subscribed to the same clan received nothing");

  const page = await rpc(b, "clan_messages_page", { p_clan_id: clan.id });
  check(page.messages.slice(-2).map((m) => m.body).join("|") === "hello from A 👋|hi A\nsecond line", "messages persist and read back in order");
  const outsider = await c.client.rpc("clan_messages_page", { p_clan_id: clan.id });
  check(outsider.error?.hint === "not_clan_member", "the outsider is refused by the API");
  const direct = await c.client.from("clan_messages").select("id").eq("clan_id", clan.id);
  check(!direct.error && direct.data.length === 0, "the outsider reads no rows directly (RLS)");

  const notMine = await b.client.rpc("delete_clan_message", { p_message_id: m1.id });
  check(notMine.error?.hint === "not_message_author", "B can't delete A's message");
  await rpc(a, "delete_clan_message", { p_message_id: m1.id });
  await until("B to see the deletion live", () => lb.got.some((p) => Number(p.new?.id) === m1.id && p.new?.deleted_at));
  check(true, "A deleted their own message and B saw it live");

  await rpc(b, "leave_clan");
  members.splice(members.indexOf(b), 1);
  const before = lb.got.length;
  await rpc(a, "send_clan_message", { p_clan_id: clan.id, p_body: "after B left" });
  await sleep(2000);
  check(lb.got.length === before, "after leaving, B receives nothing live");
  const gone = await b.client.rpc("clan_messages_page", { p_clan_id: clan.id });
  check(gone.error?.hint === "not_clan_member", "after leaving, B is refused by the API");
  for (const l of [la, lb, lc]) await l.stop();
  console.log(`\nPASS: ${checks.length} checks on ${new URL(url).host}.`);
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  // Leave the temporary clan (the last one out closes it, deleting its chat), then remove the users.
  for (const m of members) {
    const { error } = await m.client.rpc("leave_clan");
    if (error) console.error(`Cleanup warning: ${m.label} couldn't leave the temporary clan (${error.message}).`);
  }
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`Cleanup warning: temporary user ${id} could not be removed (${error.message}).`);
  }
  process.exit(process.exitCode ?? 0);
}
