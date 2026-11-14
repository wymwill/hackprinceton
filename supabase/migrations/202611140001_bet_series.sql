-- Bet Series storage. Apply with `supabase db push` or the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.bet_series (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text not null default '',
  host_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'LOBBY' check (status in ('LOBBY','ACTIVE','COMPLETED','CANCELLED')),
  planned_bet_count integer not null check (planned_bet_count > 0),
  initial_bankroll bigint not null check (initial_bankroll > 0),
  loser_count integer not null check (loser_count > 0),
  stake_mode text not null check (stake_mode = 'SHARED_FAVOR_POOL'),
  created_at timestamptz not null default now(),
  started_at timestamptz
);
create table if not exists public.bet_series_participants (
  series_id uuid not null references public.bet_series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  joined_at timestamptz not null default now(),
  balance bigint not null default 0 check (balance >= 0),
  primary key (series_id,user_id)
);
alter table public.bet_series enable row level security;
alter table public.bet_series_participants enable row level security;
create or replace function public.is_bet_series_member(p_series_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.bet_series_participants p where p.series_id=p_series_id and p.user_id=p_user_id)
$$;
revoke all on function public.is_bet_series_member(uuid,uuid) from public, anon;
grant execute on function public.is_bet_series_member(uuid,uuid) to authenticated;
create policy "series members read series" on public.bet_series for select using (
  public.is_bet_series_member(id,auth.uid())
);
create policy "members read roster" on public.bet_series_participants for select using (
  public.is_bet_series_member(series_id,auth.uid())
);
revoke all on public.bet_series, public.bet_series_participants from anon, authenticated;
grant select on public.bet_series, public.bet_series_participants to authenticated;

-- Security-definer RPCs make host checks and transitions atomic across instances.
create or replace function public.create_bet_series(p_title text,p_description text,p_planned_bet_count integer,p_initial_bankroll bigint,p_loser_count integer,p_stake_mode text)
returns public.bet_series language plpgsql security definer set search_path=public as $$
declare s public.bet_series;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_title is null or char_length(trim(p_title)) not between 1 and 100 or p_planned_bet_count<=0 or p_initial_bankroll<=0 or p_loser_count<=0 or p_stake_mode <> 'SHARED_FAVOR_POOL' then raise exception 'invalid_series'; end if;
 insert into public.bet_series(title,description,host_user_id,planned_bet_count,initial_bankroll,loser_count,stake_mode) values(trim(p_title),coalesce(p_description,''),auth.uid(),p_planned_bet_count,p_initial_bankroll,p_loser_count,p_stake_mode) returning * into s;
 insert into public.bet_series_participants(series_id,user_id) values(s.id,auth.uid()); return s;
end $$;
create or replace function public.join_bet_series(p_series_id uuid)
returns public.bet_series_participants language plpgsql security definer set search_path=public as $$
declare s public.bet_series; p public.bet_series_participants;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 select * into s from public.bet_series where id=p_series_id for update;
 if not found then raise exception 'series_not_found'; end if;
 if s.status <> 'LOBBY' then raise exception 'series_not_lobby'; end if;
 insert into public.bet_series_participants(series_id,user_id) values(s.id,auth.uid()) on conflict(series_id,user_id) do nothing returning * into p;
 if p.user_id is null then select * into p from public.bet_series_participants where series_id=s.id and user_id=auth.uid(); end if;
 return p;
end $$;
create or replace function public.start_bet_series(p_series_id uuid)
returns public.bet_series language plpgsql security definer set search_path=public as $$
declare s public.bet_series; n integer;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 select * into s from public.bet_series where id=p_series_id for update;
 if not found then raise exception 'series_not_found'; end if;
 if s.host_user_id <> auth.uid() then raise exception 'not_host'; end if;
 if s.status='ACTIVE' then return s; end if;
 if s.status <> 'LOBBY' then raise exception 'series_not_lobby'; end if;
 select count(*) into n from public.bet_series_participants where series_id=s.id;
 if n < greatest(2,2*s.loser_count) then raise exception 'too_few_participants'; end if;
 update public.bet_series_participants set balance=s.initial_bankroll where series_id=s.id;
 update public.bet_series set status='ACTIVE',started_at=now() where id=s.id returning * into s;
 return s;
end $$;
revoke all on function public.create_bet_series(text,text,integer,bigint,integer,text), public.join_bet_series(uuid), public.start_bet_series(uuid) from public, anon;
grant execute on function public.create_bet_series(text,text,integer,bigint,integer,text), public.join_bet_series(uuid), public.start_bet_series(uuid) to authenticated;
