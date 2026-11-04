-- RTM 2026-11-04: deployed production function definitions (idempotent upgrade).
-- Enhanced gold/prism counts as a separately owned copy when quantity is zero.
-- The unenhanced stock is used before an enhanced final copy for trade/combination.
-- Existing collection, user IDs, grades, card catalog and drop probabilities remain unchanged.
-- MY TEAM assigned cards remain protected. Trading may transfer an enhanced final copy.
-- Note: Run on databases that already have RKBO pack/combination/community tables.
BEGIN;
CREATE OR REPLACE FUNCTION rkbo_private.combo_check(p_cards text[], p_lock boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 u uuid:=auth.uid(); v_n integer:=coalesce(array_length(p_cards,1),0);
 rec record; i record; v_grade text; v_season integer; v_first integer;
 v_mixed boolean:=false; v_points integer:=0; v_details jsonb:='[]'::jsonb;
 v_weight integer;
BEGIN
 IF u IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated'
   OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION 'Google 로그인이 필요합니다' USING ERRCODE='28000';
 END IF;
 IF v_n NOT BETWEEN 3 AND 5 OR array_position(p_cards,NULL) IS NOT NULL THEN
  RAISE EXCEPTION '카드는 3~5장을 선택해야 합니다' USING ERRCODE='22023';
 END IF;
 FOR rec IN SELECT x.card_id,COUNT(*)::integer AS used
   FROM unnest(p_cards) AS x(card_id) GROUP BY x.card_id ORDER BY x.card_id LOOP
   IF length(rec.card_id)>160 THEN RAISE EXCEPTION '선수 카드 ID가 잘못되었습니다' USING ERRCODE='22023'; END IF;
   IF p_lock THEN
     SELECT inv.quantity,inv.gold_border,inv.prism,c.season,c.grade,c.name
       INTO i FROM public.rkbo_card_inventory inv
       JOIN public.rkbo_pack_cards c ON c.card_id=inv.card_id
       WHERE inv.user_id=u AND inv.card_id=rec.card_id FOR UPDATE OF inv;
   ELSE
     SELECT inv.quantity,inv.gold_border,inv.prism,c.season,c.grade,c.name
       INTO i FROM public.rkbo_card_inventory inv
       JOIN public.rkbo_pack_cards c ON c.card_id=inv.card_id
       WHERE inv.user_id=u AND inv.card_id=rec.card_id;
   END IF;
   IF NOT FOUND THEN RAISE EXCEPTION '보유하지 않은 카드입니다: %',rec.card_id USING ERRCODE='22023'; END IF;
   IF i.grade NOT IN ('브론즈','실버','골드','코랄','다이아몬드') THEN
     RAISE EXCEPTION '특수카드는 일반 조합 재료로 사용할 수 없습니다' USING ERRCODE='22023';
   END IF;
   IF i.quantity + (i.gold_border OR i.prism)::integer
       < rec.used + (NOT (i.gold_border OR i.prism))::integer THEN
     RAISE EXCEPTION '조합할 수 있는 카드 수량이 부족합니다(일반 카드의 마지막 1장은 보호됩니다)' USING ERRCODE='22023';
   END IF;
   IF EXISTS(SELECT 1 FROM public.rkbo_owned_teams t
     WHERE t.user_id=u AND EXISTS(SELECT 1 FROM jsonb_array_elements(t.slots) slot
       WHERE slot->>'cardId'=rec.card_id)) THEN
     RAISE EXCEPTION 'MY TEAM 편성 중인 카드는 조합에서 보호됩니다' USING ERRCODE='22023';
   END IF;
   v_weight:=CASE i.grade WHEN '브론즈' THEN 1 WHEN '실버' THEN 3
       WHEN '골드' THEN 7 WHEN '코랄' THEN 15 WHEN '다이아몬드' THEN 30 END;
   v_points:=v_points+v_weight*rec.used;
   IF v_first IS NULL THEN v_first:=i.season;
   ELSIF v_first<>i.season THEN v_mixed:=true; END IF;
   v_details:=v_details||jsonb_build_array(jsonb_build_object(
    'cardId',rec.card_id,'name',i.name,'season',i.season,
    'grade',i.grade,'spent',rec.used,'points',v_weight*rec.used));
 END LOOP;
 RETURN jsonb_build_object('points',v_points,'mode',CASE WHEN v_mixed THEN 'mixed' ELSE 'same' END,
  'season',CASE WHEN v_mixed THEN NULL ELSE v_first END,'materials',v_details);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rkbo_combo_inventory()
 RETURNS TABLE(card_id text, season integer, grade text, name text, ovr integer, available integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT c.card_id,c.season,c.grade,c.name,c.ovr,(i.quantity + (i.gold_border OR i.prism)::integer - (NOT (i.gold_border OR i.prism))::integer)
 FROM public.rkbo_card_inventory i JOIN public.rkbo_pack_cards c ON c.card_id=i.card_id
 WHERE i.user_id=(SELECT auth.uid()) AND (i.quantity>1 OR i.gold_border OR i.prism)
 AND c.grade IN ('브론즈','실버','골드','코랄','다이아몬드')
 AND NOT EXISTS(SELECT 1 FROM public.rkbo_owned_teams t
   WHERE t.user_id=i.user_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(t.slots) x
    WHERE x->>'cardId'=i.card_id))
 ORDER BY c.season DESC,c.ovr DESC,c.card_id;
$function$;

CREATE OR REPLACE FUNCTION public.rkbo_combine_cards(p_card_ids text[], p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 u uuid:=auth.uid(); past jsonb; checked jsonb; quote jsonb;
 seasons integer[]; chosen_season integer; rate jsonb;
 labels text[]:=ARRAY['브론즈','실버','골드','코랄','다이아몬드','특수'];
 label text; chosen_grade text; roll numeric:=floor(random()*100000000)/1000000; cumulative numeric:=0;
 drawn public.rkbo_pack_cards%rowtype; material record;
 answer jsonb;
BEGIN
 IF u IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated'
    OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
   RAISE EXCEPTION 'Google 로그인이 필요합니다' USING ERRCODE='28000';
 END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION '중복 처리 방지 요청 ID가 필요합니다' USING ERRCODE='22023'; END IF;
 -- One user-level serialization lock; duplicate requests return same result with no extra spend.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('rkbo-combo'),pg_catalog.hashtext(u::text));
 SELECT h.response INTO past FROM public.rkbo_combo_history h
 WHERE h.user_id=u AND h.request_id=p_request_id;
 IF FOUND THEN RETURN past||jsonb_build_object('replayed',true); END IF;
 checked:=rkbo_private.combo_check(p_card_ids,true);
 quote:=public.rkbo_combo_quote(p_card_ids);
 seasons:=ARRAY(SELECT jsonb_array_elements_text(quote->'eligibleSeasons')::integer);
 chosen_season:=seasons[1+floor(random()*array_length(seasons,1))::integer];
 rate:=rkbo_private.combo_rates((checked->>'points')::integer,chosen_season);
 FOREACH label IN ARRAY labels LOOP
  cumulative:=cumulative+coalesce((rate->>label)::numeric,0);
  IF roll<cumulative THEN chosen_grade:=label;EXIT;END IF;
 END LOOP;
 IF chosen_grade IS NULL THEN
  FOR material IN SELECT unnest(labels) AS g LOOP
   IF (rate->>material.g)::numeric>0 THEN chosen_grade:=material.g;END IF;
  END LOOP;
 END IF;
 IF chosen_grade IS NULL THEN RAISE EXCEPTION '조합 결과 등급을 결정할 수 없습니다' USING ERRCODE='22023'; END IF;
 IF chosen_grade='특수' THEN
  SELECT c.* INTO drawn FROM public.rkbo_pack_special_registry r
   JOIN public.rkbo_pack_cards c ON c.card_id=r.card_id
   WHERE r.season=chosen_season AND r.active AND c.season=chosen_season
    AND c.grade IN ('신인왕','드림','나눔','MVP','베스트릴리프')
   ORDER BY random() LIMIT 1;
 ELSE
  SELECT * INTO drawn FROM public.rkbo_pack_cards
   WHERE season=chosen_season AND grade=chosen_grade
   ORDER BY random() LIMIT 1;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION '조합 결과 카드 데이터가 존재하지 않습니다' USING ERRCODE='22023'; END IF;
 FOR material IN SELECT x.card_id,COUNT(*)::integer AS spent FROM unnest(p_card_ids) x(card_id)
    GROUP BY x.card_id ORDER BY x.card_id LOOP
  UPDATE public.rkbo_card_inventory
     SET quantity=GREATEST(quantity-material.spent,0),
         gold_border=CASE WHEN material.spent>quantity THEN false ELSE gold_border END,
         prism=CASE WHEN material.spent>quantity THEN false ELSE prism END,
         last_acquired_at=now()
     WHERE user_id=u AND card_id=material.card_id
       AND quantity + (gold_border OR prism)::integer
           >= material.spent + (NOT (gold_border OR prism))::integer;
  IF NOT FOUND THEN RAISE EXCEPTION '조합 재료 수량이 변경되었습니다. 다시 선택해 주세요' USING ERRCODE='40001'; END IF;
 END LOOP;
 INSERT INTO public.rkbo_card_inventory(user_id,card_id,quantity,first_acquired_at,last_acquired_at,gold_border,prism)
 VALUES(u,drawn.card_id,1,now(),now(),false,false)
 ON CONFLICT(user_id,card_id) DO UPDATE
 SET quantity=public.rkbo_card_inventory.quantity+1,last_acquired_at=now();
 answer:=jsonb_build_object('result',jsonb_build_object('cardId',drawn.card_id,
  'season',drawn.season,'grade',drawn.grade,'name',drawn.name,'ovr',drawn.ovr,'team',drawn.team),
  'points',checked->'points','mode',checked->'mode','materials',checked->'materials',
  'odds',quote->'odds','seasonOdds',rate,'balanceVersion',quote->'balanceVersion',
  'season',chosen_season,'replayed',false);
 INSERT INTO public.rkbo_combo_history(user_id,request_id,ingredients,points,season_mode,
   result_season,result_card_id,result_grade,response)
 VALUES(u,p_request_id,checked->'materials',(checked->>'points')::integer,checked->>'mode',
    chosen_season,drawn.card_id,drawn.grade,answer);
 RETURN answer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rkbo_community_collection(p_user uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 80, p_offset integer DEFAULT 0)
 RETURNS TABLE(card_id text, season integer, grade text, name text, ovr integer, quantity integer, tradable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated'
  OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION 'Google 로그인이 필요합니다' USING ERRCODE='28000';
 END IF;
 IF p_user IS NULL THEN RETURN;END IF;
 IF p_user<>auth.uid() AND EXISTS (
  SELECT 1 FROM public.rkbo_community_visibility s
  WHERE s.user_id=p_user AND s.is_public=false) THEN
  RETURN;
 END IF;
 RETURN QUERY
 SELECT c.card_id,c.season,c.grade,c.name,c.ovr,(i.quantity + (i.gold_border OR i.prism)::integer),
  ((i.quantity>0 OR i.gold_border OR i.prism)
   AND NOT EXISTS(SELECT 1 FROM public.rkbo_owned_teams t
    WHERE t.user_id=p_user AND EXISTS(
     SELECT 1 FROM jsonb_array_elements(t.slots) slot WHERE slot->>'cardId'=i.card_id)))
 FROM public.rkbo_card_inventory i
 JOIN public.rkbo_pack_cards c ON c.card_id=i.card_id
 WHERE i.user_id=p_user AND (i.quantity>0 OR i.gold_border OR i.prism)
  AND (coalesce(p_search,'')='' OR
    c.name ILIKE '%'||left(trim(p_search),60)||'%' OR
    c.card_id ILIKE '%'||left(trim(p_search),60)||'%')
 ORDER BY c.season DESC,c.ovr DESC,c.card_id
 LIMIT least(greatest(coalesce(p_limit,80),1),100)
 OFFSET least(greatest(coalesce(p_offset,0),0),10000);
END;$function$;

CREATE OR REPLACE FUNCTION public.rkbo_community_trade(p_action text, p_target uuid DEFAULT NULL::uuid, p_offered text DEFAULT NULL::text, p_requested text DEFAULT NULL::text, p_trade uuid DEFAULT NULL::uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 u uuid:=auth.uid();t public.rkbo_community_trades%rowtype;
 i1 public.rkbo_card_inventory%rowtype;i2 public.rkbo_card_inventory%rowtype;
 sender uuid;receiver uuid;
BEGIN
 IF u IS NULL OR coalesce(auth.jwt()->>'role','')<>'authenticated'
  OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION 'Google 로그인이 필요합니다' USING ERRCODE='28000';
 END IF;
 IF p_action='create' THEN
  IF p_target IS NULL OR p_target=u OR p_offered IS NULL OR p_requested IS NULL
   OR p_offered=p_requested OR p_request IS NULL THEN
   RAISE EXCEPTION '교환 대상·선수 카드·요청 ID를 확인해 주세요' USING ERRCODE='22023';
  END IF;
  SELECT * INTO t FROM public.rkbo_community_trades
   WHERE sender_id=u AND request_id=p_request;
  IF FOUND THEN RETURN jsonb_build_object('id',t.id,'status',t.status,'replayed',true);END IF;
  IF EXISTS (SELECT 1 FROM public.rkbo_community_visibility
    WHERE user_id=u AND is_public=false)
    OR EXISTS (SELECT 1 FROM public.rkbo_community_visibility
    WHERE user_id=p_target AND is_public=false) THEN
   RAISE EXCEPTION '교환하려면 양쪽 회원 모두 도감을 공개해야 합니다' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.rkbo_card_inventory i WHERE i.user_id=u AND i.card_id=p_offered
     AND (i.quantity>0 OR i.gold_border OR i.prism)
     AND NOT EXISTS(SELECT 1 FROM public.rkbo_owned_teams team
      WHERE team.user_id=u AND EXISTS(SELECT 1 FROM jsonb_array_elements(team.slots) slot
       WHERE slot->>'cardId'=p_offered)))
    OR NOT EXISTS(SELECT 1 FROM public.rkbo_card_inventory i WHERE i.user_id=p_target AND i.card_id=p_requested
     AND (i.quantity>0 OR i.gold_border OR i.prism)
     AND NOT EXISTS(SELECT 1 FROM public.rkbo_owned_teams team
      WHERE team.user_id=p_target AND EXISTS(SELECT 1 FROM jsonb_array_elements(team.slots) slot
       WHERE slot->>'cardId'=p_requested))) THEN
   RAISE EXCEPTION '교환 가능한 보유 카드가 양쪽에 필요합니다(MY TEAM 편성 카드 제외)' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.rkbo_community_trades(sender_id,receiver_id,offered_card_id,requested_card_id,request_id)
   VALUES(u,p_target,p_offered,p_requested,p_request)
   ON CONFLICT(sender_id,request_id) DO NOTHING
   RETURNING * INTO t;
  IF NOT FOUND THEN
   SELECT * INTO t FROM public.rkbo_community_trades WHERE sender_id=u AND request_id=p_request;
  END IF;
  RETURN jsonb_build_object('id',t.id,'status',t.status,'replayed',false);
 END IF;
 IF p_trade IS NULL THEN RAISE EXCEPTION '교환 요청이 없습니다' USING ERRCODE='22023';END IF;
 SELECT * INTO t FROM public.rkbo_community_trades WHERE id=p_trade FOR UPDATE;
 IF NOT FOUND OR (u<>t.sender_id AND u<>t.receiver_id) THEN
  RAISE EXCEPTION '내 교환 요청이 아닙니다' USING ERRCODE='42501';
 END IF;
 IF t.status<>'pending' THEN
  RETURN jsonb_build_object('id',t.id,'status',t.status,'replayed',true);
 END IF;
 IF p_action='cancel' AND u=t.sender_id OR p_action='decline' AND u=t.receiver_id THEN
  UPDATE public.rkbo_community_trades SET status=CASE WHEN p_action='cancel' THEN 'cancelled' ELSE 'declined' END,
    completed_at=now() WHERE id=t.id RETURNING * INTO t;
  RETURN jsonb_build_object('id',t.id,'status',t.status);
 END IF;
 IF p_action<>'accept' OR u<>t.receiver_id THEN
  RAISE EXCEPTION '수락·거절 권한이 없습니다' USING ERRCODE='42501';
 END IF;
 sender:=t.sender_id;receiver:=t.receiver_id;
 -- Serializes multi-user transfers regardless of who initiates them.
 PERFORM pg_advisory_xact_lock(hashtextextended('rkbo-trade:'||least(sender::text,receiver::text),0));
 PERFORM pg_advisory_xact_lock(hashtextextended('rkbo-trade:'||greatest(sender::text,receiver::text),0));
 SELECT * INTO i1 FROM public.rkbo_card_inventory
  WHERE user_id=sender AND card_id=t.offered_card_id FOR UPDATE;
 SELECT * INTO i2 FROM public.rkbo_card_inventory
  WHERE user_id=receiver AND card_id=t.requested_card_id FOR UPDATE;
 IF i1.user_id IS NULL OR i2.user_id IS NULL OR
  (i1.quantity=0 AND NOT (i1.gold_border OR i1.prism)) OR (i2.quantity=0 AND NOT (i2.gold_border OR i2.prism)) OR
  EXISTS(SELECT 1 FROM public.rkbo_owned_teams team WHERE team.user_id=sender AND
   EXISTS(SELECT 1 FROM jsonb_array_elements(team.slots) slot WHERE slot->>'cardId'=t.offered_card_id)) OR
  EXISTS(SELECT 1 FROM public.rkbo_owned_teams team WHERE team.user_id=receiver AND
   EXISTS(SELECT 1 FROM jsonb_array_elements(team.slots) slot WHERE slot->>'cardId'=t.requested_card_id)) THEN
  RAISE EXCEPTION '제안 이후 카드 보유 상태가 바뀌어 교환할 수 없습니다' USING ERRCODE='22023';
 END IF;
 UPDATE public.rkbo_card_inventory SET
     quantity=GREATEST(quantity-1,0),
     gold_border=CASE WHEN quantity=0 THEN false ELSE gold_border END,
     prism=CASE WHEN quantity=0 THEN false ELSE prism END,
     last_acquired_at=now()
   WHERE user_id=sender AND card_id=t.offered_card_id AND (quantity>0 OR gold_border OR prism);
 IF NOT FOUND THEN RAISE EXCEPTION '보낸 카드 수량이 부족합니다' USING ERRCODE='40001';END IF;
 UPDATE public.rkbo_card_inventory SET
     quantity=GREATEST(quantity-1,0),
     gold_border=CASE WHEN quantity=0 THEN false ELSE gold_border END,
     prism=CASE WHEN quantity=0 THEN false ELSE prism END,
     last_acquired_at=now()
   WHERE user_id=receiver AND card_id=t.requested_card_id AND (quantity>0 OR gold_border OR prism);
 IF NOT FOUND THEN RAISE EXCEPTION '받을 카드 수량이 부족합니다' USING ERRCODE='40001';END IF;
 INSERT INTO public.rkbo_card_inventory(user_id,card_id,quantity,gold_border,prism)
   VALUES(receiver,t.offered_card_id,CASE WHEN i1.quantity=0 THEN 0 ELSE 1 END,
     i1.quantity=0 AND i1.gold_border,i1.quantity=0 AND i1.prism)
   ON CONFLICT(user_id,card_id) DO UPDATE
   SET quantity=public.rkbo_card_inventory.quantity +
       CASE WHEN EXCLUDED.gold_border OR EXCLUDED.prism THEN
         CASE WHEN public.rkbo_card_inventory.gold_border OR public.rkbo_card_inventory.prism THEN 1 ELSE 0 END
       ELSE 1 END,
       gold_border=public.rkbo_card_inventory.gold_border OR EXCLUDED.gold_border,
       prism=public.rkbo_card_inventory.prism OR EXCLUDED.prism,
       last_acquired_at=now();
 INSERT INTO public.rkbo_card_inventory(user_id,card_id,quantity,gold_border,prism)
   VALUES(sender,t.requested_card_id,CASE WHEN i2.quantity=0 THEN 0 ELSE 1 END,
     i2.quantity=0 AND i2.gold_border,i2.quantity=0 AND i2.prism)
   ON CONFLICT(user_id,card_id) DO UPDATE
   SET quantity=public.rkbo_card_inventory.quantity +
       CASE WHEN EXCLUDED.gold_border OR EXCLUDED.prism THEN
         CASE WHEN public.rkbo_card_inventory.gold_border OR public.rkbo_card_inventory.prism THEN 1 ELSE 0 END
       ELSE 1 END,
       gold_border=public.rkbo_card_inventory.gold_border OR EXCLUDED.gold_border,
       prism=public.rkbo_card_inventory.prism OR EXCLUDED.prism,
       last_acquired_at=now();
 UPDATE public.rkbo_community_trades SET status='accepted',completed_at=now()
  WHERE id=t.id RETURNING * INTO t;
 RETURN jsonb_build_object('id',t.id,'status',t.status);
END;$function$;
COMMIT;
