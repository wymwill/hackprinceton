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
 update public.series_bets set status=case when p_cancel then 'CANCELLED' else 'RESOLVED' end,winning_outcome=case when p_cancel then null else p_outcome end where id=b.id;
 return jsonb_build_object('betId',b.id,'status',case when p_cancel then 'CANCELLED' else 'RESOLVED' end,'payouts',payouts,'pool',pool);
end $$;
