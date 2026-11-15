alter table public.bet_series
  add column if not exists require_favor_contribution boolean not null default true;

alter function public.create_bet_series(text,text,integer,bigint,integer,text,text[],jsonb,jsonb)
  rename to create_bet_series_without_optional_contributions;
create function public.create_bet_series(
  p_title text,p_description text,p_planned_bet_count integer,p_initial_bankroll bigint,
  p_loser_count integer,p_stake_mode text,p_questions text[] default '{}',p_settings jsonb default '{}',p_bets jsonb default null
) returns public.bet_series language plpgsql security definer set search_path=public as $$
declare s public.bet_series;
begin
  s:=public.create_bet_series_without_optional_contributions(p_title,p_description,p_planned_bet_count,p_initial_bankroll,
    p_loser_count,p_stake_mode,p_questions,p_settings,p_bets);
  update public.bet_series set require_favor_contribution=coalesce((p_settings->>'requireFavorContribution')::boolean,true)
    where id=s.id returning * into s;
  return s;
end $$;
grant execute on function public.create_bet_series(text,text,integer,bigint,integer,text,text[],jsonb,jsonb) to authenticated;

-- Preserve the existing JSON builder while adding the new setting.
alter function public._bs_series_json(uuid) rename to _bs_series_json_without_contribution_setting;
create function public._bs_series_json(p_series_id uuid) returns jsonb
language sql stable set search_path=public as $$
  select jsonb_set(public._bs_series_json_without_contribution_setting(p_series_id),
    '{settings,requireFavorContribution}', to_jsonb(s.require_favor_contribution))
  from public.bet_series s where s.id = p_series_id
$$;

create or replace function public._bs_blockers(p_series_id uuid) returns table(code text, message text)
language plpgsql stable set search_path=public as $$
declare s public.bet_series; v_n int; v_x int; v_missing text; v_waiting text; v_bets int; v_pool int; v_required int;
begin
  select * into s from public.bet_series where id = p_series_id;
  select count(*) into v_n from public.bet_series_participants where series_id = s.id and plays;
  v_x := s.loser_count;
  if v_n < 2 then
    code := 'one_person'; message := 'At least 2 players need to join.'; return next;
  elsif s.stake_mode = 'SHARED_FAVOR_POOL' and 2 * v_x > v_n then
    code := 'too_few_participants'; message := format('A shared pool needs at least %s players so the top %s can pick for the bottom %s.', 2 * v_x, v_x, v_x); return next;
  elsif v_x >= v_n then
    code := 'too_few_participants'; message := format('Need more than %s players for %s to lose.', v_x, v_x); return next;
  end if;
  if s.stake_mode <> 'MONEY' then
    if s.stake_mode = 'PLEDGE' or s.require_favor_contribution then
      select string_agg(p.display_name, ', ' order by p.join_seq) into v_missing
      from public.bet_series_participants p where p.series_id = s.id and p.plays
        and not exists (select 1 from public.series_favors f where f.series_id = s.id and f.submitted_by = p.user_id and not f.withdrawn);
      if v_missing is not null then code := 'favors_missing'; message := 'Waiting on favors from ' || v_missing || '.'; return next; end if;
    end if;
    if s.stake_mode = 'SHARED_FAVOR_POOL' then
      select count(*) into v_pool from public.series_favors f where f.series_id=s.id and not f.withdrawn;
      v_required := case when s.exclusive_pool then v_x else 1 end;
      if v_pool < v_required then
        code := 'pool_too_small';
        message := format('Add at least %s punishment%s to the pool for %s loser%s.', v_required,
          case when v_required=1 then '' else 's' end, v_x, case when v_x=1 then '' else 's' end);
        return next;
      end if;
    end if;
  end if;
  select string_agg(p.display_name, ', ' order by p.join_seq) into v_waiting
  from public.bet_series_participants p where p.series_id=s.id and p.plays and not p.ready;
  if v_waiting is not null then code:='not_ready'; message:='Not ready yet: '||v_waiting||'.'; return next; end if;
  select count(*) into v_bets from public.series_bets where series_id=s.id;
  if s.bet_creation='UPFRONT' and v_bets<s.planned_bet_count then
    code:='planned_questions_required'; message:=format('Write all %s bets before starting (%s so far).',s.planned_bet_count,v_bets); return next;
  end if;
end $$;

create or replace function public.set_series_ready(p_series_id uuid,p_ready boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; p public.bet_series_participants;
begin
  select * into s from public.bet_series where id=p_series_id for update;
  if not found then perform public._bs_fail('series_not_found','That series doesn''t exist.'); end if;
  select * into p from public.bet_series_participants where series_id=s.id and user_id=auth.uid();
  if not found then perform public._bs_fail('not_member','You''re not in this series.'); end if;
  if s.status<>'LOBBY' then perform public._bs_fail('series_not_lobby','Betting has already started.'); end if;
  if not p.plays then perform public._bs_fail('not_player','You''re hosting without playing, so you don''t mark ready.'); end if;
  if p_ready and s.stake_mode='PLEDGE' and not exists(select 1 from public.series_favors where series_id=s.id and submitted_by=auth.uid() and not withdrawn) then
    perform public._bs_fail('favors_missing','Pledge your punishment first.');
  end if;
  if p_ready and s.stake_mode='SHARED_FAVOR_POOL' and s.require_favor_contribution and not exists(select 1 from public.series_favors where series_id=s.id and submitted_by=auth.uid() and not withdrawn) then
    perform public._bs_fail('favors_missing','Add at least one punishment to the pool first.');
  end if;
  if p_ready and s.stake_mode='SHARED_FAVOR_POOL' then
    update public.series_favors set consented_by=array(select distinct unnest(consented_by||auth.uid())) where series_id=s.id and not withdrawn and submitted_by<>auth.uid();
  end if;
  update public.bet_series_participants set ready=coalesce(p_ready,false) where series_id=s.id and user_id=auth.uid();
  return coalesce(p_ready,false);
end $$;

grant execute on function public._bs_series_json(uuid), public.set_series_ready(uuid,boolean) to authenticated;
