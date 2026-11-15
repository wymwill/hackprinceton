// Generate one transactional SQL Editor script from the canonical migrations.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=['202611140021_tutorial_credits.sql','202611150001_photon_messaging.sql','202611150002_photon_responsive_replies.sql'];
export async function photonSetupSql() {
  const migrations=await Promise.all(files.map(f=>readFile(path.join(root,'supabase','migrations',f),'utf8')));
  return `-- Bookie: tutorial credits and Photon setup for an existing game database.
-- Includes migrations 202611140021, 202611150001 and 202611150002.
-- Run in the correct project's Supabase SQL Editor. Does not modify existing games.
-- If Photon is already partially installed, inspect the schema and apply only missing migrations.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $guard$ begin
 if to_regclass('public.bet_series') is null or to_regclass('public.series_bets') is null
  or to_regclass('public.series_bet_results') is null or to_regclass('public.player_profiles') is null
  or to_regprocedure('public._soc_me()') is null
  or to_regprocedure('public.is_bet_series_member(uuid,uuid)') is null
  or to_regprocedure('public._bs_fail(text,text)') is null then
  raise exception 'Bookie game migrations are missing. Stop and select the correct project or apply prerequisite migrations first.';
 end if;
 if to_regclass('public.photon_pair_codes') is not null or to_regclass('public.photon_connections') is not null
  or to_regclass('public.photon_inbound') is not null or to_regclass('public.photon_proofs') is not null
  or to_regclass('public.photon_outbox') is not null then
  raise exception 'Photon tables already exist. Stop and apply only the missing canonical migrations; do not rerun this initial setup.';
 end if;
end $guard$;
${migrations.join('\n\n')}
notify pgrst, 'reload schema';
commit;
-- Expected: five tables and the responsive queue function exist.
select to_regclass('public.photon_proofs') as proofs,
 to_regprocedure('public.photon_claim(text,text)') as responsive_queue;
`;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) process.stdout.write(await photonSetupSql());
