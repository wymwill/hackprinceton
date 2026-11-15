-- Bookie: tutorial credits and Photon setup for an existing game database.
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
-- Tutorial credits.
--
-- Finishing the basic tutorial (its quiz is checked here) gives 200 credits,
-- once per account. Credits wait on your profile until the next series you
-- play in starts; then they're added to your starting coins there and used up.
--
-- The bonus is applied by a trigger that runs at the end of the transaction
-- that moves a series from LOBBY to ACTIVE, after the start has set everyone's
-- starting balance. That keeps start_bet_series itself untouched.

alter table public.player_profiles
  add column if not exists credits integer not null default 0 check (credits >= 0),
  add column if not exists tutorial_done_at timestamptz;

alter table public.bet_series_participants
  add column if not exists bonus_coins integer not null default 0;

/** Your credits, and whether you've finished the tutorial. */
create or replace function public.my_credits() returns jsonb
language plpgsql security definer set search_path=public as $$
declare me public.player_profiles;
begin
  me := public._soc_me();
  return jsonb_build_object('credits', me.credits, 'tutorialDoneAt', me.tutorial_done_at);
end $$;

/**
 * Finish the tutorial. p_answers holds the quiz: { payout, rules, bottom }.
 * Wrong answers are refused; the first correct finish gives 200 credits.
 */
create or replace function public.complete_tutorial(p_answers jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare me public.player_profiles; awarded integer := 0;
begin
  me := public._soc_me();
  if coalesce(p_answers->>'payout', '') <> 'split'
    or coalesce(p_answers->>'rules', '') <> 'lobby'
    or coalesce(p_answers->>'bottom', '') <> 'punishment' then
    perform public._bs_fail('quiz_wrong', 'Not quite. Check your answers and try again.');
  end if;
  if me.tutorial_done_at is null then
    awarded := 200;
    update public.player_profiles set credits = credits + awarded, tutorial_done_at = now()
    where user_id = me.user_id returning * into me;
  end if;
  return jsonb_build_object('credits', me.credits, 'awarded', awarded, 'tutorialDoneAt', me.tutorial_done_at);
end $$;

/** When a series starts, each player's credits become extra starting coins there. */
create or replace function public._tc_apply_credits() returns trigger
language plpgsql security definer set search_path=public as $$
declare r record;
begin
  for r in
    select p.user_id, pr.credits
    from public.bet_series_participants p
    join public.player_profiles pr on pr.user_id = p.user_id
    where p.series_id = new.id and p.plays and pr.credits > 0
    for update of pr
  loop
    update public.bet_series_participants
      set balance = balance + r.credits, bonus_coins = bonus_coins + r.credits
      where series_id = new.id and user_id = r.user_id;
    update public.player_profiles set credits = 0 where user_id = r.user_id;
    perform public._bs_log(new.id, public._bs_name(new.id, r.user_id) || ' started with ' || public._bs_coins(r.credits) || ' bonus coins from the tutorial.');
  end loop;
  return null;
end $$;

drop trigger if exists bet_series_apply_credits on public.bet_series;
create constraint trigger bet_series_apply_credits
  after update of status on public.bet_series
  deferrable initially deferred
  for each row
  when (old.status = 'LOBBY' and new.status = 'ACTIVE')
  execute function public._tc_apply_credits();

revoke all on function public._tc_apply_credits() from public, anon, authenticated;
revoke all on function public.my_credits(), public.complete_tutorial(jsonb) from public, anon;
grant execute on function public.my_credits(), public.complete_tutorial(jsonb) to authenticated;


-- Photon 2.0 iMessage: opt-in account pairing, proof inbox and durable result delivery.
create table public.photon_pair_codes (
 user_id uuid primary key references auth.users(id) on delete cascade,
 code_hash text not null unique, expires_at timestamptz not null
);
create table public.photon_connections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 project_id text not null, sender_id text not null, space_id text not null,
 alerts boolean not null default true, selected_bet uuid references public.series_bets(id) on delete set null,
 selected_until timestamptz, created_at timestamptz not null default now(),
 unique(project_id,sender_id), unique(project_id,space_id)
);
create table public.photon_inbound (
 message_id text primary key, received_at timestamptz not null default now()
);
create table public.photon_proofs (
 id uuid primary key default gen_random_uuid(), bet_id uuid not null references public.series_bets(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 message_id text not null unique, body text not null check(length(body)<=2000),
 attachment_id text, created_at timestamptz not null default now()
);
create table public.photon_outbox (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.photon_connections(id) on delete cascade,
 event_key text not null, body text not null, kind text not null default 'reply',
 created_at timestamptz not null default now(), available_at timestamptz not null default now(),
 attempts int not null default 0, lease uuid, sent_at timestamptz,
 unique(connection_id,event_key)
);
create index photon_outbox_pending on public.photon_outbox(available_at) where sent_at is null;
alter table public.photon_pair_codes enable row level security;
alter table public.photon_connections enable row level security;
alter table public.photon_inbound enable row level security;
alter table public.photon_proofs enable row level security;
alter table public.photon_outbox enable row level security;
revoke all on public.photon_pair_codes,public.photon_connections,public.photon_inbound,public.photon_proofs,public.photon_outbox from public,anon,authenticated;
create policy "members read submitted proof" on public.photon_proofs for select to authenticated
 using(exists(select 1 from public.series_bets b where b.id=bet_id and public.is_bet_series_member(b.series_id,auth.uid())));
grant select on public.photon_proofs to authenticated;

create function public.photon_status() returns jsonb language sql security definer set search_path=public as $$
 select coalesce((select jsonb_build_object('connected',true,'alerts',alerts) from public.photon_connections where user_id=auth.uid()),'{"connected":false,"alerts":false}'::jsonb)
$$;
create function public.photon_pair(p_hash text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then perform public._bs_fail('unauthorized','Sign in first.'); end if;
 if p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid pairing code'; end if;
 insert into public.photon_pair_codes values(auth.uid(),p_hash,now()+interval '10 minutes')
 on conflict(user_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
end $$;
create function public.photon_disconnect() returns void language plpgsql security definer set search_path=public as $$
begin
 delete from public.photon_connections where user_id=auth.uid();
 delete from public.photon_pair_codes where user_id=auth.uid();
end $$;

-- Called only by the signed webhook service. Receipt, proof and reply commit atomically.
create function public.photon_receive(p_project text,p_sender text,p_space text,p_message text,p_text text,p_attachment text default null)
returns void language plpgsql security definer set search_path=public as $$
declare c public.photon_connections; v_user uuid; v_code text; v_reply text; v_cmd text:=upper(trim(p_text));
 v_bet uuid; v_n int; v_body text; v_rows text;
begin
 -- Serialise messages in a DM, including duplicate webhook attempts.
 perform pg_advisory_xact_lock(hashtextextended(p_project||':'||p_sender,0));
 if exists(select 1 from public.photon_inbound where message_id=p_message) then return; end if;
 insert into public.photon_inbound(message_id) values(p_message);
 select * into c from public.photon_connections where project_id=p_project and sender_id=p_sender for update;
 if v_cmd ~ '^LINK [A-F0-9]{24}$' then
  v_code:=lower(substr(v_cmd,6));
  delete from public.photon_pair_codes where code_hash=encode(digest(v_code,'sha256'),'hex') and expires_at>now() returning user_id into v_user;
  if v_user is null then return; end if;
  -- A paired sender cannot silently take over a second Bookie account.
  if c.id is not null and c.user_id<>v_user then return; end if;
  if exists(select 1 from public.photon_connections where user_id=v_user and (project_id<>p_project or sender_id<>p_sender)) then return; end if;
  insert into public.photon_connections(user_id,project_id,sender_id,space_id) values(v_user,p_project,p_sender,p_space)
  on conflict(user_id) do update set space_id=excluded.space_id,alerts=true returning * into c;
  v_reply:='Connected to Bookie! Results arrive here. Text BETS to send proof, RESULTS for standings, or STOP to pause alerts.';
 elsif c.id is null or c.space_id<>p_space then return;
 elsif v_cmd='STOP' then
  update public.photon_connections set alerts=false where id=c.id;
  delete from public.photon_outbox where connection_id=c.id and sent_at is null and kind='result';
  v_reply:='Result alerts paused. Text START to resume. You can still send proof and ask for RESULTS.';
 elsif v_cmd='START' then
  update public.photon_connections set alerts=true where id=c.id;
  v_reply:='Result alerts are on.';
 elsif v_cmd='RESULTS' then
  select string_agg(x.line,E'\n\n') into v_reply from (
   select s.title||E'\n'||(select string_agg(r.display_name||': '||r.balance||' coins',E'\n' order by r.balance desc,r.joined_at)
    from public.bet_series_participants r where r.series_id=s.id and r.plays) as line
   from public.bet_series s join public.bet_series_participants p on p.series_id=s.id and p.user_id=c.user_id
   where s.status in ('ACTIVE','COMPLETED') order by s.created_at desc limit 3
  ) x;
  v_reply:=coalesce(v_reply,'No active or finished games yet.');
 elsif v_cmd='BETS' then
  select string_agg(x.line,E'\n') into v_rows from (
   select left(b.id::text,8)||' — '||left(b.question,150) as line from public.series_bets b
   join public.bet_series_participants p on p.series_id=b.series_id and p.user_id=c.user_id
   where b.status in ('OPEN','LOCKED') order by b.created_at desc limit 10
  ) x;
  v_reply:=coalesce(v_rows||E'\n\nText PROOF <code> and your evidence, or PROOF <code> then send an image.','No open bets to send proof for.');
 elsif v_cmd ~ '^PROOF [A-F0-9]{8}([[:space:]]|$)' then
  select count(*),(array_agg(b.id))[1] into v_n,v_bet from public.series_bets b
   where left(b.id::text,8)=lower(substr(v_cmd,7,8)) and b.status in ('OPEN','LOCKED')
    and public.is_bet_series_member(b.series_id,c.user_id);
  if v_n<>1 then
   update public.photon_connections set selected_bet=null,selected_until=null where id=c.id;
   v_reply:='That bet is unavailable. Text BETS for the current codes.';
  else
   update public.photon_connections set selected_bet=v_bet,selected_until=now()+interval '15 minutes' where id=c.id;
   v_body:=trim(substr(trim(p_text),15));
   if v_body<>'' or p_attachment is not null then
    insert into public.photon_proofs(bet_id,user_id,message_id,body,attachment_id) values(v_bet,c.user_id,p_message,left(v_body,2000),p_attachment);
    v_reply:='Proof saved for host review. The host still calls the result.';
   else v_reply:='Ready. Send an image or a short note within 15 minutes. The host will review it.'; end if;
  end if;
 elsif c.selected_bet is not null and c.selected_until>now() and (p_attachment is not null or trim(p_text)<>'') and v_cmd not in ('HELP','HI','HELLO') then
  if exists(select 1 from public.series_bets b where b.id=c.selected_bet and b.status in ('OPEN','LOCKED') and public.is_bet_series_member(b.series_id,c.user_id)) then
   insert into public.photon_proofs(bet_id,user_id,message_id,body,attachment_id) values(c.selected_bet,c.user_id,p_message,left(p_text,2000),p_attachment);
   v_reply:='Proof saved for host review. The host still calls the result.';
  else v_reply:='That bet has closed. Text BETS for another.'; end if;
 else v_reply:='Bookie: BETS to send proof, RESULTS for standings, STOP to pause alerts, START to resume. No real-money betting.';
 end if;
 insert into public.photon_outbox(connection_id,event_key,body) values(c.id,p_message,left(v_reply,6000)) on conflict do nothing;
end $$;

create function public._photon_result() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status in ('RESOLVED','CANCELLED') and old.status not in ('RESOLVED','CANCELLED') then
  insert into public.photon_outbox(connection_id,event_key,body,kind)
   select c.id,'result:'||new.id,
    'Bookie · '||s.title||E'\n'||new.question||E'\n'||
    case when new.status='CANCELLED' then 'Cancelled. Coins returned.' when new.refunded then 'Refunded. Coins returned.' else 'Result: '||coalesce(new.winning_outcome,'Resolved') end||
    E'\nYour balance: '||p.balance||' coins. Text RESULTS for standings.', 'result'
   from public.bet_series s join public.bet_series_participants p on p.series_id=s.id
   join public.photon_connections c on c.user_id=p.user_id and c.alerts
   where s.id=new.series_id on conflict do nothing;
 end if;
 return new;
end $$;
create trigger photon_result after update of status on public.series_bets for each row execute function public._photon_result();

-- Workers lease rows atomically. Stable outbox IDs are Photon idempotency keys.
create function public.photon_claim(p_project text) returns table(id uuid,lease uuid,space_id text,body text) language sql security definer set search_path=public as $$
 with picked as (
  select o.id from public.photon_outbox o join public.photon_connections c on c.id=o.connection_id
  where c.project_id=p_project and o.sent_at is null and o.available_at<=now() and o.attempts<10
   and (o.kind<>'result' or c.alerts) order by o.created_at for update of o skip locked limit 10
 ), leased as (
  update public.photon_outbox o set lease=gen_random_uuid(),available_at=now()+interval '2 minutes',attempts=attempts+1
  from picked where picked.id=o.id returning o.*
 ) select l.id,l.lease,c.space_id,l.body from leased l join public.photon_connections c on c.id=l.connection_id
$$;
create function public.photon_ack(p_id uuid,p_lease uuid) returns void language sql security definer set search_path=public as $$
 update public.photon_outbox set sent_at=now() where id=p_id and lease=p_lease
$$;
revoke all on function public.photon_status(),public.photon_pair(text),public.photon_disconnect() from public,anon;
grant execute on function public.photon_status(),public.photon_pair(text),public.photon_disconnect() to authenticated;
revoke all on function public.photon_receive(text,text,text,text,text,text),public.photon_claim(text),public.photon_ack(uuid,uuid),public._photon_result() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.photon_receive(text,text,text,text,text,text),public.photon_claim(text),public.photon_ack(uuid,uuid) to service_role;
 end if;
end $$;


-- Interactive replies should not wait behind alerts for unrelated conversations.
drop function public.photon_claim(text);
create function public.photon_claim(p_project text, p_space text default null)
returns table(id uuid,lease uuid,space_id text,body text)
language sql security definer set search_path=public as $$
 with picked as (
  select o.id from public.photon_outbox o join public.photon_connections c on c.id=o.connection_id
  where c.project_id=p_project and (p_space is null or c.space_id=p_space)
   and o.sent_at is null and o.available_at<=now() and o.attempts<10
   and (o.kind<>'result' or c.alerts)
  order by (o.kind='reply') desc, o.created_at, o.id
  for update of o skip locked limit 10
 ), leased as (
  update public.photon_outbox o set lease=gen_random_uuid(),available_at=now()+interval '2 minutes',attempts=attempts+1
  from picked where picked.id=o.id returning o.*
 ) select l.id,l.lease,c.space_id,l.body from leased l
 join public.photon_connections c on c.id=l.connection_id
$$;
revoke all on function public.photon_claim(text,text) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.photon_claim(text,text) to service_role;
 end if;
end $$;

notify pgrst, 'reload schema';
commit;
-- Expected: five tables and the responsive queue function exist.
select to_regclass('public.photon_proofs') as proofs,
 to_regprocedure('public.photon_claim(text,text)') as responsive_queue;
