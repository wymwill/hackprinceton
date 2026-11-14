alter table public.series_bets drop constraint if exists series_bets_status_check;
alter table public.series_bets add constraint series_bets_status_check check(status in ('PLANNED','OPEN','LOCKED','RESOLVED','CANCELLED'));
alter table public.series_bets add column position integer;
with numbered as (
  select id,row_number() over(partition by series_id order by created_at,id)::integer as n from public.series_bets
)
update public.series_bets b set position=numbered.n from numbered where b.id=numbered.id;
alter table public.series_bets alter column position set not null;
create unique index series_bets_series_position_unique on public.series_bets(series_id,position);

-- The new create path stores the entire planned schedule in the same transaction.
create or replace function public.create_bet_series(p_title text,p_description text,p_planned_bet_count integer,p_initial_bankroll bigint,p_loser_count integer,p_stake_mode text,p_questions text[])
returns public.bet_series language plpgsql security definer set search_path=public as $$
declare s public.bet_series; q text; i integer;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_title is null or char_length(trim(p_title)) not between 1 and 100 or p_planned_bet_count is null or p_planned_bet_count<=0 or p_initial_bankroll is null or p_initial_bankroll<=0 or p_loser_count is null or p_loser_count<=0 or p_stake_mode is distinct from 'SHARED_FAVOR_POOL' then raise exception 'invalid_series'; end if;
 if coalesce(array_length(p_questions,1),0)<>p_planned_bet_count then raise exception 'planned_questions_required'; end if;
 for i in 1..p_planned_bet_count loop
  q:=p_questions[i]; if q is null or char_length(trim(q)) not between 1 and 300 then raise exception 'invalid_question'; end if;
 end loop;
 insert into public.bet_series(title,description,host_user_id,planned_bet_count,initial_bankroll,loser_count,stake_mode)
 values(trim(p_title),coalesce(p_description,''),auth.uid(),p_planned_bet_count,p_initial_bankroll,p_loser_count,p_stake_mode) returning * into s;
 insert into public.bet_series_participants(series_id,user_id) values(s.id,auth.uid());
 for i in 1..p_planned_bet_count loop
  insert into public.series_bets(series_id,question,created_by,status,position) values(s.id,trim(p_questions[i]),auth.uid(),'PLANNED',i);
 end loop;
 return s;
end $$;
revoke all on function public.create_bet_series(text,text,integer,bigint,integer,text,text[]) from public,anon;
grant execute on function public.create_bet_series(text,text,integer,bigint,integer,text,text[]) to authenticated;

-- Older clients may create an empty lobby; they must still fill all slots before start.
create or replace function public.create_series_bet(p_series_id uuid,p_question text) returns public.series_bets
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; n integer;
begin
 select * into s from public.bet_series where id=p_series_id for update;
 if s.id is null then raise exception 'series_not_found'; end if;
 if s.host_user_id<>auth.uid() then raise exception 'not_host'; end if;
 if s.status<>'LOBBY' then raise exception 'questions_locked'; end if;
 if p_question is null or char_length(trim(p_question)) not between 1 and 300 then raise exception 'invalid_question'; end if;
 select count(*) into n from public.series_bets where series_id=s.id;
 if n>=s.planned_bet_count then raise exception 'planned_questions_full'; end if;
 insert into public.series_bets(series_id,question,created_by,status,position) values(s.id,trim(p_question),auth.uid(),'PLANNED',n+1) returning * into b;
 return b;
end $$;

create or replace function public.start_bet_series(p_series_id uuid)
returns public.bet_series language plpgsql security definer set search_path=public as $$
declare s public.bet_series; n integer; q integer;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 select * into s from public.bet_series where id=p_series_id for update;
 if s.id is null then raise exception 'series_not_found'; end if;
 if s.host_user_id<>auth.uid() then raise exception 'not_host'; end if;
 if s.status='ACTIVE' then return s; end if;
 if s.status<>'LOBBY' then raise exception 'series_not_lobby'; end if;
 select count(*) into n from public.bet_series_participants where series_id=s.id;
 if n=1 then raise exception 'one_person'; end if;
 if n<greatest(2,2*s.loser_count) then raise exception 'too_few_participants'; end if;
 select count(*) into q from public.series_bets where series_id=s.id and status='PLANNED';
 if q<>s.planned_bet_count then raise exception 'planned_questions_required'; end if;
 update public.bet_series_participants set balance=s.initial_bankroll where series_id=s.id;
 update public.series_bets set status='OPEN' where series_id=s.id and position=1;
 update public.bet_series set status='ACTIVE',started_at=now() where id=s.id returning * into s;
 return s;
end $$;

-- Closing a one-sided pool immediately returns every stake, independent of outcome.
create or replace function public.lock_series_bet(p_series_id uuid,p_bet_id uuid) returns public.series_bets
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; sides integer; only_side text;
begin
 select * into s from public.bet_series where id=p_series_id for update;
 if s.id is null or s.host_user_id<>auth.uid() then raise exception 'not_host'; end if;
 if s.status<>'ACTIVE' then raise exception 'series_not_active'; end if;
 update public.series_bets set status='LOCKED' where id=p_bet_id and series_id=p_series_id and status='OPEN' returning * into b;
 if b.id is null then raise exception 'bet_not_open'; end if;
 select count(distinct outcome),min(outcome) into sides,only_side from public.series_wagers where bet_id=b.id;
 if sides=1 then
  perform public.finish_series_bet(p_series_id,p_bet_id,only_side,false);
  select * into b from public.series_bets where id=p_bet_id;
 end if;
 return b;
end $$;

create or replace function public.finish_series_bet(p_series_id uuid,p_bet_id uuid,p_outcome text,p_cancel boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; pool bigint; winning_stake bigint; w record; payouts jsonb:='[]'::jsonb; payout_amount bigint; allocated bigint:=0; remainder bigint:=0; wager_count int; first_winner uuid;
begin
 select * into s from public.bet_series where id=p_series_id for update;
 if s.id is null or s.host_user_id<>auth.uid() then raise exception 'not_host'; end if;
 if s.status<>'ACTIVE' then raise exception 'series_not_active'; end if;
 if not p_cancel and p_outcome not in ('YES','NO') then raise exception 'invalid_outcome'; end if;
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
   payout_amount:=(pool*w.stake)/winning_stake; allocated:=allocated+payout_amount;
  end loop;
  remainder:=pool-allocated;
  for w in select sw.user_id,sum(sw.amount) as stake from public.series_wagers sw where sw.bet_id=b.id and sw.outcome=p_outcome group by sw.user_id order by sw.user_id loop
   payout_amount:=(pool*w.stake)/winning_stake;
   if w.user_id=first_winner then payout_amount:=payout_amount+remainder; end if;
   update public.bet_series_participants set balance=balance+payout_amount where series_id=s.id and user_id=w.user_id;
   payouts:=payouts||jsonb_build_object('userId',w.user_id,'gross',payout_amount,'refunded',false);
  end loop;
 end if;
 update public.series_bets set status=case when p_cancel then 'CANCELLED' else 'RESOLVED' end,
 winning_outcome=case when p_cancel then null else p_outcome end where id=b.id;
 update public.series_bets set status='OPEN' where series_id=s.id and position=(select min(position) from public.series_bets where series_id=s.id and status='PLANNED');
 return jsonb_build_object('betId',b.id,'status',case when p_cancel then 'CANCELLED' else 'RESOLVED' end,'payouts',payouts,'pool',pool);
end $$;

-- With a fixed schedule, a canceled slot is closed and refundable but cannot be replaced after start.
create or replace function public.complete_bet_series(p_series_id uuid) returns public.bet_series
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; closed_count integer;
begin
 select * into s from public.bet_series where id=p_series_id for update;
 if s.id is null or s.host_user_id<>auth.uid() then raise exception 'not_host'; end if;
 if s.status='COMPLETED' then return s; end if;
 if s.status<>'ACTIVE' then raise exception 'series_not_active'; end if;
 if exists(select 1 from public.series_bets where series_id=s.id and status in ('PLANNED','OPEN','LOCKED')) then raise exception 'bets_still_open'; end if;
 select count(*) into closed_count from public.series_bets where series_id=s.id and status in ('RESOLVED','CANCELLED');
 if closed_count<>s.planned_bet_count then raise exception 'planned_bets_incomplete'; end if;
 update public.bet_series set status='COMPLETED' where id=s.id returning * into s;
 return s;
end $$;
