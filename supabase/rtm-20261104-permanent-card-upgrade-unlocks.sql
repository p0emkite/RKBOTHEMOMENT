-- RTM 2026-11-04 — Permanent card upgrade unlocks.
-- Live production definitions. Existing historical public.rkbo_card_upgrades rows
-- are the permanent user+card+kind entitlement; NO user inventory data is changed.
--
-- Physical card state:
--   inventory.quantity = additional ordinary copies;
--   inventory.gold_border/prism = one currently owned enhanced copy.
--   A consumed/traded enhanced copy may reset current inventory flags to false.
--   Its historical entitlement remains with the original upgrader.
--   Any later acquisition restores all previously bought upgrades automatically;
--   if needed one acquired ordinary copy is converted into the enhanced copy.
--   A recipient of an enhanced physical copy can still transfer that copy,
--   but does not receive an extra permanent unlock without upgrade history.
--   Gold and prism unlocks may be combined on the same re-acquired copy.
--   No new upgrade costs, no changes to pack odds.
BEGIN;
CREATE OR REPLACE FUNCTION rkbo_private.restore_card_upgrades_on_acquire()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  unlocked_gold boolean;
  unlocked_prism boolean;
BEGIN
  -- A spend or trade-away is not a new acquisition.
  IF TG_OP = 'UPDATE' AND NEW.quantity <= OLD.quantity
     AND NOT (NEW.gold_border AND NOT OLD.gold_border)
     AND NOT (NEW.prism AND NOT OLD.prism) THEN
    RETURN NEW;
  END IF;
  -- Creating a zero-copy placeholder does not grant free ownership.
  IF TG_OP = 'INSERT' AND NEW.quantity = 0
     AND NOT NEW.gold_border AND NOT NEW.prism THEN
    RETURN NEW;
  END IF;
  SELECT
    EXISTS(
      SELECT 1 FROM public.rkbo_card_upgrades u
      WHERE u.user_id=NEW.user_id AND u.card_id=NEW.card_id AND u.kind='gold'
    ),
    EXISTS(
      SELECT 1 FROM public.rkbo_card_upgrades u
      WHERE u.user_id=NEW.user_id AND u.card_id=NEW.card_id AND u.kind='prism'
    )
  INTO unlocked_gold,unlocked_prism;
  IF (unlocked_gold AND NOT NEW.gold_border)
     OR (unlocked_prism AND NOT NEW.prism) THEN
    -- Upgrade attaches to ONE of the already-existing newly owned copies.
    -- Inventory.quantity counts unenhanced extras; flags count one premium copy.
    IF NOT NEW.gold_border AND NOT NEW.prism AND NEW.quantity>0 THEN
      NEW.quantity:=NEW.quantity-1;
    END IF;
    NEW.gold_border:=NEW.gold_border OR unlocked_gold;
    NEW.prism:=NEW.prism OR unlocked_prism;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION rkbo_private.restore_card_upgrades_on_acquire()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS rkbo_restore_card_upgrades_on_acquire
 ON public.rkbo_card_inventory;
CREATE TRIGGER rkbo_restore_card_upgrades_on_acquire BEFORE INSERT OR UPDATE OF quantity, gold_border, prism ON public.rkbo_card_inventory FOR EACH ROW EXECUTE FUNCTION rkbo_private.restore_card_upgrades_on_acquire();
CREATE OR REPLACE FUNCTION public.rkbo_open_card_pack(p_season integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid := auth.uid();
 v_role text := auth.jwt()->>'role'; -- Current PostgREST JWT claim accessor; legacy request.jwt.claim.role can be absent.
 v_state public.rkbo_pack_state%rowtype;
 v_now timestamptz := clock_timestamp();
 v_pack_number integer;
 v_force boolean;
 v_hit boolean := false;
  v_hit_diamond boolean := false;
  v_pity_triggered boolean := false;
 v_roll numeric;
 v_bytes bytea;
 v_grade text;
 v_card record;
 v_quantity integer;
 v_previously_owned boolean;
 v_selected_special boolean := false;
 v_draws jsonb := '[]'::jsonb;
 i integer;
begin
 if v_user is null or coalesce(v_role,'') <> 'authenticated' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Google 로그인이 필요합니다' using errcode='28000';
 end if;
 if p_season is null or not exists(
  select 1 from public.rkbo_pack_settings where season=p_season and active
 ) then
  raise exception '선택한 시즌의 카드팩은 현재 개봉할 수 없습니다' using errcode='22023';
 end if;
 insert into public.rkbo_pack_state(user_id) values(v_user) on conflict do nothing;
 select * into strict v_state from public.rkbo_pack_state where user_id=v_user for update;
 -- Measure the cooldown after acquiring the row lock, not before waiting for it.
 v_now:=clock_timestamp();
 if v_state.last_open_at is not null and v_now<v_state.last_open_at+interval '5 seconds' then
  raise exception '다음 카드팩은 잠시 후 열 수 있습니다 (5초 간격)' using errcode='22023';
 end if;
 v_pack_number:=v_state.total_packs+1;
 v_force:=v_state.no_diamond_streak>=49;
 for i in 1..5 loop
  v_bytes:=extensions.gen_random_bytes(4);
  v_roll:=(pg_catalog.get_byte(v_bytes,0)::numeric*16777216+
   pg_catalog.get_byte(v_bytes,1)::numeric*65536+
   pg_catalog.get_byte(v_bytes,2)::numeric*256+
   pg_catalog.get_byte(v_bytes,3)::numeric)/4294967296;
  v_selected_special:=false;
  if v_force and i=5 and not v_hit then v_pity_triggered:=true; end if;
   v_grade:=case when v_pity_triggered then '다이아몬드'
   when v_roll < 0.50 then '브론즈'
   when v_roll < 0.82 then '실버'
   when v_roll < 0.98 then '골드'
   when v_roll < 0.99 then '코랄'
   when v_roll < 0.995 then '다이아몬드'
   else '__SPECIAL__' end;
  if v_grade='__SPECIAL__' then
   select c.card_id,c.name,c.team,c.position,c.ovr,c.grade into v_card
   from public.rkbo_pack_special_registry r
   join public.rkbo_pack_cards c on c.card_id=r.card_id
   where r.season=p_season and r.active
   order by random() limit 1;
   if found then
    v_grade:=v_card.grade;
    v_selected_special:=true;
   else
    -- An empty special pool causes the reserved 0.5% to redistribute
    -- proportionally among the five standard rarities, not fail the pack.
    v_roll:=(v_roll-0.995)*199;
    v_grade:=case when v_roll < 0.50 then '브론즈'
     when v_roll < 0.82 then '실버'
     when v_roll < 0.98 then '골드'
     when v_roll < 0.99 then '코랄'
     else '다이아몬드' end;
   end if;
  end if;
  if not v_selected_special then
   select card_id,name,team,position,ovr,grade into v_card
   from public.rkbo_pack_cards
   where season=p_season and grade=v_grade
   order by random() limit 1;
  end if;
  if not found then raise exception '시즌별 카드풀이 아직 준비되지 않았습니다' using errcode='22023'; end if;
  select exists(select 1 from public.rkbo_card_inventory
    where user_id=v_user and card_id=v_card.card_id
      and (quantity>0 or gold_border or prism)) into v_previously_owned;
  insert into public.rkbo_card_inventory(user_id,card_id,quantity)
   values(v_user,v_card.card_id,1)
  on conflict(user_id,card_id) do update
   set quantity=public.rkbo_card_inventory.quantity+1,last_acquired_at=clock_timestamp()
  returning quantity + (gold_border or prism)::integer into v_quantity;
  v_draws:=v_draws||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'cardId',v_card.card_id,'grade',v_grade,'name',v_card.name,'team',v_card.team,
   'pos',v_card.position,'ovr',v_card.ovr,'quantity',v_quantity,'isNew',not v_previously_owned
  ));
  if v_grade='다이아몬드' then v_hit_diamond:=true; end if;
   if v_grade in ('다이아몬드','신인왕','드림','나눔','MVP','베스트릴리프') then v_hit:=true; end if;
 end loop;
 update public.rkbo_pack_state
 set total_packs=v_pack_number,
  no_diamond_streak=case when v_hit then 0 else v_state.no_diamond_streak+1 end,
  last_open_at=v_now
 where user_id=v_user;
 insert into public.rkbo_pack_history(user_id,pack_number,season,draws)
 values(v_user,v_pack_number,p_season,v_draws);
 return pg_catalog.jsonb_build_object('packNumber',v_pack_number,'season',p_season,
  'draws',v_draws,'noDiamondStreak',case when v_hit then 0 else v_state.no_diamond_streak+1 end,
  'hitDiamond',v_hit_diamond,'hitPremium',v_hit,'noPremiumStreak',case when v_hit then 0 else v_state.no_diamond_streak+1 end,
   'pityTriggered',v_pity_triggered);
end;
$function$;
COMMIT;
