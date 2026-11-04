-- RTM: allow MY TEAM cards to be traded; invalidate all affected stored teams atomically.
-- Affected cardId becomes JSON null and tradedOutCardId retains a reference for
-- client display. All other player slots and batting/pitching order stay intact.
-- Repair: choose a new owned card for each missing slot in MY TEAM and save.
-- Match servers reject incomplete rosters until repair. This function replaces
-- the previous server version and preserves its auth, lock and inventory rules.
BEGIN;
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
     AND (i.quantity>0 OR i.gold_border OR i.prism))
    OR NOT EXISTS(SELECT 1 FROM public.rkbo_card_inventory i WHERE i.user_id=p_target AND i.card_id=p_requested
     AND (i.quantity>0 OR i.gold_border OR i.prism)) THEN
   RAISE EXCEPTION '양측 모두 교환할 보유 카드가 필요합니다' USING ERRCODE='22023';
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
  (i1.quantity=0 AND NOT (i1.gold_border OR i1.prism)) OR
  (i2.quantity=0 AND NOT (i2.gold_border OR i2.prism)) THEN
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
 -- Every team using a traded card becomes incomplete until the owner explicitly
 -- selects a replacement and saves a validated 18-card roster. Retain slot/order.
 UPDATE public.rkbo_owned_teams club
 SET slots=(
   SELECT jsonb_agg(
     CASE WHEN elem->>'cardId'=t.offered_card_id
       THEN (elem - 'cardId' - 'ovr')
          ||jsonb_build_object('cardId',NULL,'ovr',NULL,'tradedOutCardId',t.offered_card_id)
       ELSE elem END ORDER BY ord)
   FROM jsonb_array_elements(club.slots) WITH ORDINALITY part(elem,ord)),
   updated_at=now()
 WHERE club.user_id=sender AND EXISTS (
   SELECT 1 FROM jsonb_array_elements(club.slots) part
   WHERE part->>'cardId'=t.offered_card_id);

 UPDATE public.rkbo_owned_teams club
 SET slots=(
   SELECT jsonb_agg(
     CASE WHEN elem->>'cardId'=t.requested_card_id
       THEN (elem - 'cardId' - 'ovr')
          ||jsonb_build_object('cardId',NULL,'ovr',NULL,'tradedOutCardId',t.requested_card_id)
       ELSE elem END ORDER BY ord)
   FROM jsonb_array_elements(club.slots) WITH ORDINALITY part(elem,ord)),
   updated_at=now()
 WHERE club.user_id=receiver AND EXISTS (
   SELECT 1 FROM jsonb_array_elements(club.slots) part
   WHERE part->>'cardId'=t.requested_card_id);
 UPDATE public.rkbo_community_trades SET status='accepted',completed_at=now()
  WHERE id=t.id RETURNING * INTO t;
 RETURN jsonb_build_object('id',t.id,'status',t.status);
END;$function$;
COMMIT;
