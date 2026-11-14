create table public.series_bets(
 id uuid primary key default gen_random_uuid(), series_id uuid not null references public.bet_series(id) on delete cascade,
 question text not null check(char_length(trim(question)) between 1 and 300), status text not null default 'OPEN' check(status in ('OPEN','LOCKED','RESOLVED','CANCELLED')),
 created_by uuid not null references auth.users(id), winning_outcome text check(winning_outcome in ('YES','NO')), created_at timestamptz not null default now()
);
create table public.series_wagers(
 id uuid primary key default gen_random_uuid(), bet_id uuid not null references public.series_bets(id) on delete cascade,
 user_id uuid not null references auth.users(id), outcome text not null check(outcome in ('YES','NO')),
 amount bigint not null check(amount>0), created_at timestamptz not null default now()
);
create table public.series_favors(
 id uuid primary key default gen_random_uuid(), series_id uuid not null references public.bet_series(id) on delete cascade,
 submitted_by uuid not null references auth.users(id), description text not null check(char_length(trim(description)) between 1 and 500),
 consented_by uuid[] not null default '{}', withdrawn boolean not null default false, created_at timestamptz not null default now()
);
create table public.series_favor_assignments(
 id uuid primary key default gen_random_uuid(), series_id uuid not null references public.bet_series(id) on delete cascade,
 winner_id uuid not null references auth.users(id), loser_id uuid not null references auth.users(id), favor_id uuid not null references public.series_favors(id),
 status text not null default 'PENDING_CONSENT' check(status in ('PENDING_CONSENT','CONSENTED','DECLINED')),
 unique(series_id,winner_id), unique(series_id,loser_id)
);
alter table public.series_bets enable row level security; alter table public.series_wagers enable row level security;
alter table public.series_favors enable row level security; alter table public.series_favor_assignments enable row level security;
create policy "members read series bets" on public.series_bets for select to authenticated using(public.is_bet_series_member(series_id,auth.uid()));
create policy "members read wagers" on public.series_wagers for select to authenticated using(exists(select 1 from public.series_bets b where b.id=bet_id and public.is_bet_series_member(b.series_id,auth.uid())));
create policy "members read favors" on public.series_favors for select to authenticated using(public.is_bet_series_member(series_id,auth.uid()));
create policy "members read assignments" on public.series_favor_assignments for select to authenticated using(public.is_bet_series_member(series_id,auth.uid()));
drop policy if exists "series members read series" on public.bet_series;
drop policy if exists "members read roster" on public.bet_series_participants;
create policy "series members read series" on public.bet_series for select to authenticated using(public.is_bet_series_member(id,auth.uid()));
create policy "members read roster" on public.bet_series_participants for select to authenticated using(public.is_bet_series_member(series_id,auth.uid()));
drop policy if exists "series members read series" on public.bet_series;
drop policy if exists "members read roster" on public.bet_series_participants;
create policy "series members read series" on public.bet_series for select to authenticated using(public.is_bet_series_member(id,auth.uid()));
create policy "members read roster" on public.bet_series_participants for select to authenticated using(public.is_bet_series_member(series_id,auth.uid()));
revoke all on public.series_bets,public.series_wagers,public.series_favors,public.series_favor_assignments from anon,authenticated;
grant select on public.series_bets,public.series_wagers,public.series_favors,public.series_favor_assignments to authenticated;

create or replace function public.create_series_bet(p_series_id uuid,p_question text) returns public.series_bets
language plpgsql security definer set search_path=public as $$ declare s public.bet_series; b public.series_bets; n int; begin
 select * into s from public.bet_series where id=p_series_id for update;
 if s.id is null then raise exception 'series_not_found'; end if; if s.host_user_id<>auth.uid() then raise exception 'not_host'; end if; if s.status<>'ACTIVE' then raise exception 'series_not_active'; end if;
 if char_length(trim(p_question)) not between 1 and 300 then raise exception 'invalid_question'; end if;
 if exists(select 1 from public.series_bets where series_id=s.id and status in ('OPEN','LOCKED')) then raise exception 'bet_already_open'; end if;
 select count(*) into n from public.series_bets where series_id=s.id and status='RESOLVED'; if n>=s.planned_bet_count then raise exception 'planned_bets_complete'; end if;
 insert into public.series_bets(series_id,question,created_by) values(s.id,trim(p_question),auth.uid()) returning * into b; return b; end $$;

create or replace function public.place_series_wager(p_series_id uuid,p_bet_id uuid,p_outcome text,p_amount bigint) returns public.series_wagers
language plpgsql security definer set search_path=public as $$ declare s public.bet_series; b public.series_bets; p public.bet_series_participants; w public.series_wagers; prior text; begin
 if p_outcome not in ('YES','NO') or p_amount<=0 then raise exception 'invalid_wager'; end if;
 select * into s from public.bet_series where id=p_series_id for update; select * into b from public.series_bets where id=p_bet_id and series_id=p_series_id for update;
 if s.id is null or b.id is null then raise exception 'bet_not_found'; end if; if s.status<>'ACTIVE' or b.status<>'OPEN' then raise exception 'bet_not_open'; end if;
 select * into p from public.bet_series_participants where series_id=s.id and user_id=auth.uid() for update; if p.user_id is null then raise exception 'not_member'; end if;
 select outcome into prior from public.series_wagers where bet_id=b.id and user_id=auth.uid() limit 1; if prior is not null and prior<>p_outcome then raise exception 'cannot_switch_sides'; end if;
 if p.balance<p_amount then raise exception 'insufficient_balance'; end if;
 update public.bet_series_participants set balance=balance-p_amount where series_id=s.id and user_id=auth.uid();
 insert into public.series_wagers(bet_id,user_id,outcome,amount) values(b.id,auth.uid(),p_outcome,p_amount) returning * into w; return w; end $$;

create or replace function public.lock_series_bet(p_series_id uuid,p_bet_id uuid) returns public.series_bets language plpgsql security definer set search_path=public as $$ declare b public.series_bets; begin
 if not exists(select 1 from public.bet_series where id=p_series_id and host_user_id=auth.uid() and status='ACTIVE') then raise exception 'not_host'; end if;
 update public.series_bets set status='LOCKED' where id=p_bet_id and series_id=p_series_id and status='OPEN' returning * into b; if b.id is null then raise exception 'bet_not_open'; end if; return b; end $$;

create or replace function public.finish_series_bet(p_series_id uuid,p_bet_id uuid,p_outcome text,p_cancel boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; pool bigint; winning_stake bigint; w record; payouts jsonb:='[]'::jsonb; payout_amount bigint; allocated bigint:=0; remainder bigint:=0; wager_count int; first_winner uuid;
begin
 select * into s from public.bet_series where id=p_series_id for update;
 if s.id is null or s.host_user_id<>auth.uid() then raise exception 'not_host'; end if;
 select * into b from public.series_bets where id=p_bet_id and series_id=p_series_id for update;
 if b.id is null or b.status not in ('OPEN','LOCKED') then raise exception 'bet_not_open'; end if;
 select coalesce(sum(sw.amount),0),count(*) into pool,wager_count from public.series_wagers sw where sw.bet_id=b.id;
 select coalesce(sum(sw.amount),0) into winning_stake from public.series_wagers sw where sw.bet_id=b.id and sw.outcome=p_outcome;
 if p_cancel or wager_count=0 or winning_stake=0 or winning_stake=pool then
  for w in select sw.user_id,sum(sw.amount) as stake from public.series_wagers sw where sw.bet_id=b.id group by sw.user_id loop
   update public.bet_series_participants set balance=balance+w.stake where series_id=s.id and user_id=w.user_id;
   payouts:=payouts||jsonb_build_object('userId',w.user_id,'gross',w.stake,'refunded',true);
  end loop;
 else
  select sw.user_id into first_winner from public.series_wagers sw where sw.bet_id=b.id and sw.outcome=p_outcome order by sw.user_id limit 1;
  for w in select sw.user_id,sum(sw.amount) as stake from public.series_wagers sw where sw.bet_id=b.id and sw.outcome=p_outcome group by sw.user_id order by sw.user_id loop
   payout_amount:=(pool*w.stake)/winning_stake;
   allocated:=allocated+payout_amount;
  end loop;
  remainder:=pool-allocated;
  for w in select sw.user_id,sum(sw.amount) as stake from public.series_wagers sw where sw.bet_id=b.id and sw.outcome=p_outcome group by sw.user_id order by sw.user_id loop
   payout_amount:=(pool*w.stake)/winning_stake;
   if w.user_id=first_winner then payout_amount:=payout_amount+remainder; end if;
   update public.bet_series_participants set balance=balance+payout_amount where series_id=s.id and user_id=w.user_id;
   payouts:=payouts||jsonb_build_object('userId',w.user_id,'gross',payout_amount,'refunded',false);
  end loop;
 end if;
 update public.series_bets set status=case when p_cancel then 'CANCELLED' else 'RESOLVED' end,winning_outcome=case when p_cancel then null else p_outcome end where id=b.id;
 return jsonb_build_object('betId',b.id,'status',case when p_cancel then 'CANCELLED' else 'RESOLVED' end,'payouts',payouts,'pool',pool);
end $$;

create or replace function public.series_leaderboard(p_series_id uuid) returns table(rank bigint,user_id uuid,balance bigint,is_loser boolean)
language sql security definer set search_path=public as $$ select row_number() over(order by p.balance desc,p.joined_at,p.user_id),p.user_id,p.balance,(row_number() over(order by p.balance desc,p.joined_at,p.user_id)>s.loser_count*0+s.loser_count) from public.bet_series_participants p join public.bet_series s on s.id=p.series_id where p.series_id=p_series_id and public.is_bet_series_member(p_series_id,auth.uid()) order by p.balance desc,p.joined_at,p.user_id $$;

create or replace function public.complete_bet_series(p_series_id uuid) returns public.bet_series language plpgsql security definer set search_path=public as $$ declare s public.bet_series; done int; begin
 select * into s from public.bet_series where id=p_series_id for update; if s.host_user_id<>auth.uid() then raise exception 'not_host'; end if; if s.status='COMPLETED' then return s; end if;
 if exists(select 1 from public.series_bets where series_id=s.id and status in ('OPEN','LOCKED')) then raise exception 'bets_still_open'; end if;
 select count(*) into done from public.series_bets where series_id=s.id and status='RESOLVED'; if done<>s.planned_bet_count then raise exception 'planned_bets_incomplete'; end if;
 update public.bet_series set status='COMPLETED' where id=s.id returning * into s; return s; end $$;

create or replace function public.propose_series_favor(p_series_id uuid,p_description text) returns public.series_favors
language plpgsql security definer set search_path=public as $$ declare f public.series_favors; begin
 if not public.is_bet_series_member(p_series_id,auth.uid()) then raise exception 'not_member'; end if;
 if (select status from public.bet_series where id=p_series_id)<>'LOBBY' then raise exception 'favor_proposals_closed'; end if;
 if char_length(trim(p_description)) not between 1 and 500 then raise exception 'invalid_favor'; end if;
 insert into public.series_favors(series_id,submitted_by,description) values(p_series_id,auth.uid(),trim(p_description)) returning * into f; return f; end $$;
create or replace function public.consent_series_favor(p_favor_id uuid,p_consent boolean) returns public.series_favors
language plpgsql security definer set search_path=public as $$ declare f public.series_favors; begin
 select * into f from public.series_favors where id=p_favor_id for update;
 if f.id is null or not public.is_bet_series_member(f.series_id,auth.uid()) then raise exception 'favor_not_found'; end if;
 if f.submitted_by=auth.uid() then raise exception 'cannot_consent_own_favor'; end if;
 if p_consent then update public.series_favors set consented_by=array(select distinct unnest(consented_by||auth.uid())) where id=f.id returning * into f;
 else update public.series_favors set consented_by=array_remove(consented_by,auth.uid()) where id=f.id returning * into f; end if; return f; end $$;
create or replace function public.assign_series_favor(p_series_id uuid,p_loser_id uuid,p_favor_id uuid) returns public.series_favor_assignments
language plpgsql security definer set search_path=public as $$ declare a public.series_favor_assignments; r bigint; total bigint; loser_rank bigint; begin
 if not exists(select 1 from public.bet_series where id=p_series_id and status='COMPLETED') then raise exception 'series_not_complete'; end if;
 select rank into r from public.series_leaderboard(p_series_id) where user_id=auth.uid();
 select rank into loser_rank from public.series_leaderboard(p_series_id) where user_id=p_loser_id;
 select count(*) into total from public.series_leaderboard(p_series_id);
 if r is null or r>(select loser_count from public.bet_series where id=p_series_id) then raise exception 'not_winner'; end if;
 if loser_rank<>total-r+1 then raise exception 'invalid_pairing'; end if;
 if not exists(select 1 from public.series_favors f where f.id=p_favor_id and f.series_id=p_series_id and not f.withdrawn and f.submitted_by=auth.uid() and p_loser_id=any(f.consented_by)) then raise exception 'favor_lacks_consent'; end if;
 insert into public.series_favor_assignments(series_id,winner_id,loser_id,favor_id) values(p_series_id,auth.uid(),p_loser_id,p_favor_id) returning * into a; return a; end $$;
create or replace function public.respond_series_favor_assignment(p_assignment_id uuid,p_accept boolean) returns public.series_favor_assignments
language plpgsql security definer set search_path=public as $$ declare a public.series_favor_assignments; begin
 update public.series_favor_assignments set status=case when p_accept then 'CONSENTED' else 'DECLINED' end where id=p_assignment_id and loser_id=auth.uid() and status='PENDING_CONSENT' returning * into a;
 if a.id is null then raise exception 'assignment_not_pending'; end if; return a; end $$;

revoke all on function public.create_series_bet(uuid,text),public.place_series_wager(uuid,uuid,text,bigint),public.lock_series_bet(uuid,uuid),public.finish_series_bet(uuid,uuid,text,boolean),public.series_leaderboard(uuid),public.complete_bet_series(uuid),public.propose_series_favor(uuid,text),public.consent_series_favor(uuid,boolean),public.assign_series_favor(uuid,uuid,uuid),public.respond_series_favor_assignment(uuid,boolean) from public,anon;
grant execute on function public.create_series_bet(uuid,text),public.place_series_wager(uuid,uuid,text,bigint),public.lock_series_bet(uuid,uuid),public.finish_series_bet(uuid,uuid,text,boolean),public.series_leaderboard(uuid),public.complete_bet_series(uuid),public.propose_series_favor(uuid,text),public.consent_series_favor(uuid,boolean),public.assign_series_favor(uuid,uuid,uuid),public.respond_series_favor_assignment(uuid,boolean) to authenticated;
