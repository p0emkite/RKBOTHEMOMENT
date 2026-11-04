-- MY TEAM cards remain visible and selectable in the public card-trade catalog.
-- Other members' private collections remain hidden by the existing visibility rule.
-- The real ownership and transaction checks are still enforced server-side.
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
  (i.quantity>0 OR i.gold_border OR i.prism)
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
