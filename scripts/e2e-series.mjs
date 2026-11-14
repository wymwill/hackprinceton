import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries((await readFile(".env.local", "utf8")).split(/\r?\n/).filter((x) => x && !x.startsWith("#")).map((line) => {
  const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)];
}));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = (await readFile(".supabase-test-secret", "utf8")).trim();
if (!url || !anon || !secret) throw new Error("Configure .env.local and .supabase-test-secret before running this test.");

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const users = [];
const seriesIds = [];
const checks = [];
function assert(condition, message) { if (!condition) throw new Error(message); checks.push(message); }
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return data;
}
async function makeUser(label) {
  const email = `codex-series-${label}-${suffix}@example.com`;
  const password = `T-${randomUUID()}-aA9!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { codex_series_e2e: true } });
  if (error) throw new Error(`Could not create disposable Auth user: ${error.message}`);
  users.push(data.user.id);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw new Error(`Could not sign in disposable Auth user: ${loginError.message}`);
  return { client, id: data.user.id };
}

try {
  const host = await makeUser("host");
  const member = await makeUser("member");
  const other = await makeUser("other");
  const series = await rpc(host.client, "create_bet_series", {
    p_title: `API test ${suffix}`, p_description: "Temporary automated test", p_planned_bet_count: 2,
    p_initial_bankroll: 1000, p_loser_count: 1, p_stake_mode: "SHARED_FAVOR_POOL",
    p_questions: ["Will the API flow settle?", "Will the one-sided pool refund?"],
  });
  const seriesId = series.id; seriesIds.push(seriesId);
  assert(series.status === "LOBBY" && series.host_user_id === host.id, "host creates LOBBY series and is assigned as host");
  const { error: onePersonStart } = await host.client.rpc("start_bet_series", { p_series_id: seriesId });
  assert(onePersonStart?.message?.includes("one_person"), "single-member start is rejected with a specific reason");
  const { data: plannedBets, error: plannedError } = await host.client.from("series_bets").select("id,position,status").eq("series_id",seriesId).order("position");
  if (plannedError) throw new Error(`Planned bets read failed: ${plannedError.message}`);
  assert(plannedBets.length === 2 && plannedBets.every(b => b.status === "PLANNED"), "all questions are stored before start");

  await rpc(member.client, "join_bet_series", { p_series_id: seriesId });
  await rpc(other.client, "join_bet_series", { p_series_id: seriesId });
  await rpc(member.client, "join_bet_series", { p_series_id: seriesId });
  const { data: roster, error: rosterError } = await host.client.from("bet_series_participants").select("user_id,balance").eq("series_id", seriesId);
  if (rosterError) throw new Error(`Roster read failed: ${rosterError.message}`);
  assert(roster.length === 3, "join retry does not duplicate membership");

  const { error: deniedStart } = await member.client.rpc("start_bet_series", { p_series_id: seriesId });
  assert(Boolean(deniedStart), "non-host cannot start series");
  await rpc(host.client, "start_bet_series", { p_series_id: seriesId });
  await rpc(host.client, "start_bet_series", { p_series_id: seriesId });
  const { data: startedRoster, error: startedError } = await host.client.from("bet_series_participants").select("balance").eq("series_id", seriesId);
  if (startedError) throw new Error(`Started roster read failed: ${startedError.message}`);
  assert(startedRoster.length === 3 && startedRoster.every((p) => p.balance === 1000), "start initializes every balance exactly once");
  const { data: openedBets, error: openedError } = await host.client.from("series_bets").select("id,status").eq("series_id",seriesId);
  if (openedError) throw new Error(`Opened bets read failed: ${openedError.message}`);
  assert(openedBets.length === 2 && openedBets.every(b => b.status === "OPEN"), "all planned questions open together");

  const { error: lateBet } = await host.client.rpc("create_series_bet", { p_series_id: seriesId, p_question: "Late question" });
  assert(Boolean(lateBet), "new questions cannot be added after start");
  const second = plannedBets[1];
  await rpc(member.client, "place_series_wager", { p_series_id: seriesId, p_bet_id: second.id, p_outcome: "YES", p_amount: 50 });
  const oneSided = await rpc(host.client, "lock_series_bet", { p_series_id: seriesId, p_bet_id: second.id });
  assert(oneSided.status === "RESOLVED", "one-sided pool automatically resolves on lock out of order");
  const { data: firstBetState, error: firstBetStateError } = await host.client.from("series_bets").select("status").eq("id",plannedBets[0].id).single();
  if (firstBetStateError) throw new Error(`First bet read failed: ${firstBetStateError.message}`);
  assert(firstBetState.status === "OPEN", "resolving a later question leaves earlier questions open");
  const bet = plannedBets[0];
  await rpc(host.client, "place_series_wager", { p_series_id: seriesId, p_bet_id: bet.id, p_outcome: "YES", p_amount: 200 });
  await rpc(member.client, "place_series_wager", { p_series_id: seriesId, p_bet_id: bet.id, p_outcome: "YES", p_amount: 100 });
  await rpc(other.client, "place_series_wager", { p_series_id: seriesId, p_bet_id: bet.id, p_outcome: "NO", p_amount: 300 });
  const { error: overdrawError } = await member.client.rpc("place_series_wager", { p_series_id: seriesId, p_bet_id: bet.id, p_outcome: "YES", p_amount: 1000 });
  assert(Boolean(overdrawError), "overspending wager is rejected");
  await rpc(host.client, "lock_series_bet", { p_series_id: seriesId, p_bet_id: bet.id });
  await rpc(host.client, "finish_series_bet", { p_series_id: seriesId, p_bet_id: bet.id, p_outcome: "YES", p_cancel: false });
  const { error: duplicateError } = await host.client.rpc("finish_series_bet", { p_series_id: seriesId, p_bet_id: bet.id, p_outcome: "YES", p_cancel: false });
  assert(Boolean(duplicateError), "duplicate settlement is rejected");

  const { data: settledRoster, error: settledError } = await host.client.from("bet_series_participants").select("user_id,balance").eq("series_id", seriesId);
  if (settledError) throw new Error(`Settlement roster read failed: ${settledError.message}`);
  const balances = new Map(settledRoster.map((p) => [p.user_id, p.balance]));
  assert(balances.get(host.id) === 1200 && balances.get(member.id) === 1100 && balances.get(other.id) === 700, "pari-mutuel settlement pays 400/200/0 gross with conserved balances");
  const { data: afterRefund, error: afterRefundError } = await host.client.from("bet_series_participants").select("user_id,balance").eq("series_id",seriesId);
  if (afterRefundError) throw new Error(`Refund roster read failed: ${afterRefundError.message}`);
  assert(afterRefund.find(p => p.user_id === member.id)?.balance === 1100, "one-sided wager is fully refunded");
  const leaderboard = await rpc(host.client, "series_leaderboard", { p_series_id: seriesId });
  assert(leaderboard[0].user_id === host.id && leaderboard.at(-1).user_id === other.id, "leaderboard ranks balances deterministically");
  await rpc(host.client, "complete_bet_series", { p_series_id: seriesId });
  await rpc(host.client, "complete_bet_series", { p_series_id: seriesId });
  assert(true, "host completion is idempotent after planned resolved bet count");

  console.log(`PASS: ${checks.length} authenticated Series database checks`);
  for (const check of checks) console.log(`  ✓ ${check}`);
} finally {
  for (const id of seriesIds) {
    const { error } = await admin.from("bet_series").delete().eq("id", id);
    if (error) console.error(`Cleanup warning: temporary Series could not be removed (${error.message}).`);
  }
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`Cleanup warning: temporary Auth user could not be removed (${error.message}).`);
  }
}
