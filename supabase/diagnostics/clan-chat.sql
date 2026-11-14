-- Read-only audit. Run the WHOLE file in the target project's SQL editor.
-- No user names, message bodies, credentials, or individual balances are returned.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';

-- SQL-editor migrations may not have a ledger entry. Compare it with the schema below.
do $$
declare versions jsonb;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'Migration ledger absent; determine applied migrations from schema/functions.';
  else
    execute 'select jsonb_agg(version order by version) from supabase_migrations.schema_migrations' into versions;
    raise notice 'Recorded migration versions: %', versions;
  end if;
end $$;

select
  to_regprocedure('public.my_series_state()') is not null as has_0007,
  to_regclass('public.clans') is not null as has_0012_clans,
  to_regclass('public.clan_members') is not null as has_0012_members,
  to_regclass('public.series_bet_outcomes') is not null as has_0009,
  exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'series_bets' and column_name = 'unit') as has_0010,
  to_regclass('public.clan_messages') is not null as has_0013,
  exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'clan_members' and column_name = 'last_read_id') as has_chat_read_cursor;

-- 0011 changes function bodies only: inspect BOTH definitions, not a table marker.
select oid::regprocedure::text as function, pg_get_functiondef(oid) as definition
from pg_proc where oid in (
  to_regprocedure('public.propose_series_favor(uuid,text)'),
  to_regprocedure('public.withdraw_series_favor(uuid)'));

-- All six public RPCs and six internal helpers must exist after 0013.
select signature, p.oid is not null as present, p.prosecdef as security_definer,
  p.proconfig as settings,
  case when p.oid is not null then has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute,
  case when p.oid is not null then has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute
from unnest(array[
  'public.is_clan_member(uuid)', 'public.clan_messages_page(uuid,bigint,bigint,integer)',
  'public.clan_chat_status()', 'public.send_clan_message(uuid,text,uuid)',
  'public.delete_clan_message(bigint)', 'public.mark_clan_chat_read(uuid,bigint)',
  'public._chat_json(public.clan_messages)', 'public._chat_require(uuid)',
  'public._chat_system(uuid,uuid,text,text,jsonb)', 'public._chat_on_join()',
  'public._chat_on_leave()', 'public._chat_on_owner()'
]) signature
left join pg_proc p on p.oid = to_regprocedure(signature);

select c.relname, c.relrowsecurity as rls_enabled, c.relreplident as replica_identity,
  has_table_privilege('authenticated', c.oid, 'SELECT') as member_select,
  has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as member_direct_write,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access
from pg_class c where c.oid = to_regclass('public.clan_messages');

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'clan_messages';

select tgname, tgenabled, pg_get_triggerdef(oid) as definition from pg_trigger
where not tgisinternal and tgname in ('clan_chat_join', 'clan_chat_leave', 'clan_chat_owner');

select pubname, pubinsert, pubupdate, pubdelete, puballtables,
  exists (select 1 from pg_publication_tables t where t.pubname = p.pubname
    and schemaname = 'public' and tablename = 'clan_messages') as publishes_chat
from pg_publication p where pubname = 'supabase_realtime';

-- Save these aggregates before applying anything, then compare immediately afterwards
-- while app writes are paused. Counts alone are not a backup or a schema audit.
select
  (select count(*) from public.bet_series) as series,
  (select count(*) from public.series_bets) as bets,
  (select count(*) from public.series_wagers) as wagers,
  (select coalesce(sum(amount), 0) from public.series_wagers) as wager_amount,
  (select count(*) from public.series_bet_results) as results,
  (select coalesce(sum(payout), 0) from public.series_bet_results) as payouts,
  (select count(*) from public.bet_series_participants) as participants,
  (select coalesce(sum(balance), 0) from public.bet_series_participants) as coins,
  (select count(*) from public.clans) as clans,
  (select count(*) from public.clan_members) as clan_members,
  (select count(*) from public.series_wagers where outcome is null or outcome not in ('YES','NO'))
    + (select count(*) from public.series_bet_results where side is null or side not in ('YES','NO'))
    + (select count(*) from public.series_bets where winning_outcome not in ('YES','NO')) as not_yes_no,
  (select count(*) from public.series_wagers w left join public.series_bets b on b.id = w.bet_id where b.id is null)
    + (select count(*) from public.series_bet_results r left join public.series_bets b on b.id = r.bet_id where b.id is null)
    as orphan_bet_references;
rollback;
