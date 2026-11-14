// Read-only API probes. No signups, logins, POSTs, or data rows are requested.
// This checks the API's schema cache, NOT the migration ledger or private data.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Configure the Supabase URL and public key in .env.local.");
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const nil = "00000000-0000-0000-0000-000000000000";
const probes = [
  ["clans", "clans?select=id&limit=0"],
  ["clan_members", "clan_members?select=user_id&limit=0"],
  ["0009 outcomes", "series_bet_outcomes?select=id&limit=0"],
  ["0010 range columns", "series_bets?select=unit,decimals,result_value&limit=0"],
  ["0013 chat", "clan_messages?select=id&limit=0"],
  ["0013 read cursor", "clan_members?select=last_read_id&limit=0"],
  ["is_clan_member", `rpc/is_clan_member?p_clan_id=${nil}`],
  ["clan_messages_page", `rpc/clan_messages_page?p_clan_id=${nil}`],
  ["clan_chat_status", "rpc/clan_chat_status"],
  ["send_clan_message", `rpc/send_clan_message?p_clan_id=${nil}&p_body=probe`],
  ["delete_clan_message", "rpc/delete_clan_message?p_message_id=0"],
  ["mark_clan_chat_read", `rpc/mark_clan_chat_read?p_clan_id=${nil}&p_message_id=0`],
];
console.log(`Read-only API checks: ${new URL(url).host}`);
for (const [label, route] of probes) {
  // PostgREST executes GET RPCs in a read-only transaction, including volatile
  // functions. With the public key these RPCs should be denied or missing.
  const res = await fetch(new URL(`/rest/v1/${route}`, url), { headers, signal: AbortSignal.timeout(10000) });
  const body = await res.json().catch(() => ({}));
  console.log(`${label}: HTTP ${res.status}${res.ok ? " (available)" : ` ${body.code ?? ""}: ${body.message ?? "request failed"}`}`);
}
console.log("Permission denied is expected for private tables/RPCs. Do not grant anon access to fix it.");
console.log("Use supabase/diagnostics/clan-chat.sql for authoritative schema, RLS, Realtime, ledger and data checks.");
