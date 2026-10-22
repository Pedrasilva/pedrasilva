-- Marketing stage 1: editorial calendar, colleague approval, content-hash invalidation and the never_mention rule.
-- Additive only: existing drafts, statuses and edited_after_approval behaviour are preserved.

ALTER TYPE public.marketing_draft_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.marketing_draft_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE public.marketing_draft_status ADD VALUE IF NOT EXISTS 'failed';

ALTER TABLE public.marketing_post_drafts
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_tag text,
  ADD COLUMN IF NOT EXISTS approved_content_hash text;
COMMENT ON COLUMN public.marketing_post_drafts.scheduled_at IS 'Planned publication moment; entered and displayed in Europe/Lisbon.';
COMMENT ON COLUMN public.marketing_post_drafts.asset_ids IS 'Ordered media list: ids of marketing_capture_assets / marketing_project_media (files stay in marketing-assets, never copied).';
COMMENT ON COLUMN public.marketing_post_drafts.approved_content_hash IS 'Hash of caption + media list + format at approval; cleared when content changes.';

-- Hash of what an approval covers: final caption (text, hashtags, story frames), ordered media list and format.
CREATE OR REPLACE FUNCTION public.marketing_post_content_hash(_caption text, _hashtags text[], _frames jsonb, _media uuid[], _format text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(concat_ws(chr(31), coalesce(_caption,''), array_to_string(coalesce(_hashtags,'{}'::text[]),' '),
    coalesce(_frames::text,''), array_to_string(coalesce(_media,'{}'::uuid[]),','), coalesce(_format,'')));
$$;

CREATE OR REPLACE FUNCTION public.marketing_draft_hash(d public.marketing_post_drafts)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.marketing_post_content_hash(coalesce(d.final_copy, d.ai_copy), coalesce(d.final_hashtags, d.ai_hashtags),
    coalesce(d.final_story_frames, d.ai_story_frames), d.asset_ids, d.format);
$$;

CREATE OR REPLACE FUNCTION public.marketing_fold(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT translate(lower(coalesce(_t,'')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

-- Terms that reveal a never_mention project: its location segments and its sector words.
CREATE OR REPLACE FUNCTION public.marketing_name_rule_terms(_location text, _sector text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT t) FILTER (WHERE length(t) >= 3), '{}'::text[]) FROM (
    SELECT btrim(public.marketing_fold(x)) t FROM regexp_split_to_table(coalesce(_location,''), '[,;/|()]') x
    UNION ALL
    SELECT unnest(CASE _sector
      WHEN 'workspace' THEN ARRAY['escritorio','escritorios','office','offices','workspace','coworking','sede']
      WHEN 'healthcare' THEN ARRAY['clinica','clinicas','clinic','clinics','hospital','saude','healthcare','dentaria','dental','medica','medical']
      WHEN 'residential' THEN ARRAY['residencia','residencial','residential','moradia','apartamento','apartment','villa']
      WHEN 'hospitality' THEN ARRAY['hotel','hoteis','hotels','hotelaria','hospitality','restaurante','restaurant','resort']
      ELSE ARRAY[]::text[] END)
  ) s;
$$;

-- Returns the blocking reason for a draft linked to a never_mention project, or NULL.
CREATE OR REPLACE FUNCTION public.marketing_draft_name_rule_violation(d public.marketing_post_drafts)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lib uuid; p record; txt text; term text;
BEGIN
  lib := public.marketing_draft_library_project(d.asset_ids, d.capture_ids, d.project_id);
  txt := public.marketing_fold(concat_ws(' ', coalesce(d.final_copy, d.ai_copy),
    array_to_string(coalesce(d.final_hashtags, d.ai_hashtags), ' '),
    (SELECT string_agg(concat_ws(' ', f->>'text', f->>'line', f->'sticker'->>'text'), ' ')
       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(coalesce(d.final_story_frames, d.ai_story_frames)) = 'array'
         THEN coalesce(d.final_story_frames, d.ai_story_frames) ELSE '[]'::jsonb END) f)));
  FOR p IN SELECT location, sector::text AS sector FROM public.marketing_project_profiles
           WHERE name_rule = 'never_mention' AND project_id IN (d.project_id, lib) LOOP
    IF nullif(btrim(coalesce(d.location_tag,'')),'') IS NOT NULL THEN
      RETURN 'Projeto confidencial: não é permitida etiqueta de localização.';
    END IF;
    FOREACH term IN ARRAY public.marketing_name_rule_terms(p.location, p.sector) LOOP
      IF txt ~ ('(^|[^a-z0-9])' || regexp_replace(term, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '([^a-z0-9]|$)') THEN
        RETURN format('Projeto confidencial: o texto final menciona «%s».', term);
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TABLE public.marketing_post_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.marketing_post_drafts(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  approver_id uuid NOT NULL,
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','changes_requested')),
  comment text,
  decided_at timestamptz,
  content_hash text NOT NULL,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_post_approvals_draft_idx ON public.marketing_post_approvals(draft_id);
CREATE INDEX marketing_post_approvals_approver_idx ON public.marketing_post_approvals(approver_id) WHERE decision = 'pending' AND voided_at IS NULL;
CREATE UNIQUE INDEX marketing_post_approvals_one_pending ON public.marketing_post_approvals(draft_id) WHERE decision = 'pending' AND voided_at IS NULL;

GRANT SELECT ON public.marketing_post_approvals TO authenticated;
GRANT ALL ON public.marketing_post_approvals TO service_role;
REVOKE TRUNCATE ON public.marketing_post_approvals FROM anon, authenticated;
ALTER TABLE public.marketing_post_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY mpa_select ON public.marketing_post_approvals FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.view', 'all')
    AND (requested_by = auth.uid() OR approver_id = auth.uid() OR public.has_module_permission(auth.uid(), 'marketing.curate', 'all')));
-- No INSERT/UPDATE/DELETE policies: approvals change only through the functions below and the draft triggers.

-- BEFORE UPDATE (fires after marketing_post_drafts_guard): voids approvals when content changes and gates status moves.
CREATE OR REPLACE FUNCTION public.marketing_post_drafts_approval_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h_new text := public.marketing_draft_hash(NEW); h_old text := public.marketing_draft_hash(OLD);
  via_rpc boolean := coalesce(current_setting('marketing.approval_rpc', true),'') = 'on'; why text;
BEGIN
  IF h_new IS DISTINCT FROM h_old AND NOT (NEW.status::text = 'approved' AND OLD.status::text NOT IN ('approved','scheduled')) THEN
    NEW.approved_content_hash := NULL;
    IF NEW.status::text IN ('approved','scheduled','pending_approval') THEN
      NEW.status := 'suggested';
    END IF;
    IF OLD.status::text IN ('approved','scheduled') THEN NEW.edited_after_approval := true; END IF;
  END IF;

  IF NEW.status::text = 'pending_approval' AND OLD.status::text <> 'pending_approval' AND NOT via_rpc THEN
    RAISE EXCEPTION 'Use «Pedir aprovação» to request an approval';
  END IF;

  IF NEW.status::text IN ('approved','scheduled') THEN
    why := public.marketing_draft_name_rule_violation(NEW);
    IF why IS NOT NULL THEN RAISE EXCEPTION '%', why; END IF;
  END IF;

  IF NEW.status::text = 'approved' AND OLD.status::text NOT IN ('approved','scheduled') THEN
    NEW.approved_content_hash := h_new;
  END IF;

  IF NEW.status::text = 'scheduled' THEN
    IF NEW.scheduled_at IS NULL THEN RAISE EXCEPTION 'Set a date and time before scheduling'; END IF;
    IF OLD.status::text NOT IN ('approved','scheduled') THEN RAISE EXCEPTION 'Only approved drafts can be scheduled'; END IF;
    IF NEW.approved_content_hash IS DISTINCT FROM h_new OR NOT EXISTS (
      SELECT 1 FROM public.marketing_post_approvals a WHERE a.draft_id = NEW.id AND a.decision = 'approved'
        AND a.voided_at IS NULL AND a.content_hash = h_new) THEN
      RAISE EXCEPTION 'No valid approval for the current content';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER marketing_post_drafts_guard_approval BEFORE UPDATE ON public.marketing_post_drafts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_post_drafts_approval_guard();

-- AFTER UPDATE: void stale approvals; record a direct curator approval as an approval row.
CREATE OR REPLACE FUNCTION public.marketing_post_drafts_approval_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h text := public.marketing_draft_hash(NEW);
BEGIN
  UPDATE public.marketing_post_approvals SET voided_at = now()
    WHERE draft_id = NEW.id AND voided_at IS NULL AND decision IN ('pending','approved')
      AND (content_hash <> h OR NEW.status::text IN ('suggested','rejected'));
  IF NEW.status::text = 'approved' AND OLD.status::text NOT IN ('approved','scheduled')
     AND coalesce(current_setting('marketing.approval_rpc', true),'') <> 'on'
     AND coalesce(auth.uid(), NEW.decided_by) IS NOT NULL THEN
    INSERT INTO public.marketing_post_approvals (draft_id, requested_by, approver_id, decision, decided_at, content_hash)
    VALUES (NEW.id, coalesce(auth.uid(), NEW.decided_by), coalesce(auth.uid(), NEW.decided_by), 'approved', now(), h);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER marketing_post_drafts_approval_sync AFTER UPDATE ON public.marketing_post_drafts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_post_drafts_approval_sync();

-- Curator asks a colleague with Marketing access to approve the current content.
CREATE OR REPLACE FUNCTION public.marketing_request_post_approval(_draft uuid, _approver uuid, _comment text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.marketing_post_drafts; aid uuid; why text;
BEGIN
  IF NOT public.has_module_permission(auth.uid(), 'marketing.curate', 'all') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _approver = auth.uid() THEN RAISE EXCEPTION 'Choose a colleague, not yourself'; END IF;
  IF NOT public.has_module_permission(_approver, 'marketing.view', 'all') THEN RAISE EXCEPTION 'This colleague has no Marketing access'; END IF;
  SELECT * INTO d FROM public.marketing_post_drafts WHERE id = _draft FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF d.status::text NOT IN ('suggested','pending_approval') THEN RAISE EXCEPTION 'Only suggested drafts can be sent for approval'; END IF;
  IF d.readiness <> 'ready' THEN RAISE EXCEPTION 'This draft is not ready: %', coalesce(d.readiness_note, d.readiness::text); END IF;
  why := public.marketing_draft_name_rule_violation(d);
  IF why IS NOT NULL THEN RAISE EXCEPTION '%', why; END IF;
  UPDATE public.marketing_post_approvals SET voided_at = now() WHERE draft_id = _draft AND decision = 'pending' AND voided_at IS NULL;
  INSERT INTO public.marketing_post_approvals (draft_id, requested_by, approver_id, comment, content_hash)
    VALUES (_draft, auth.uid(), _approver, nullif(btrim(coalesce(_comment,'')),''), public.marketing_draft_hash(d)) RETURNING id INTO aid;
  PERFORM set_config('marketing.approval_rpc','on',true);
  UPDATE public.marketing_post_drafts SET status = 'pending_approval' WHERE id = _draft;
  PERFORM set_config('marketing.approval_rpc','off',true);
  INSERT INTO public.notifications (user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
    VALUES (_approver, 'marketing_post_approval', 'Pedido de aprovação de publicação',
      left(coalesce(d.final_copy, d.ai_copy), 160), '/marketing/posts?draft=' || _draft, 'marketing', 'marketing_post_approval', aid, 'mpa-req-' || aid);
  RETURN aid;
END $$;

-- The chosen approver approves or requests changes; the requester is notified.
CREATE OR REPLACE FUNCTION public.marketing_decide_post_approval(_approval uuid, _decision text, _comment text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.marketing_post_approvals; d public.marketing_post_drafts;
BEGIN
  IF _decision NOT IN ('approved','changes_requested') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT * INTO a FROM public.marketing_post_approvals WHERE id = _approval FOR UPDATE;
  IF NOT FOUND OR a.approver_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your approval request'; END IF;
  IF NOT public.has_module_permission(auth.uid(), 'marketing.view', 'all') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF a.decision <> 'pending' OR a.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This request is no longer pending'; END IF;
  IF _decision = 'changes_requested' AND nullif(btrim(coalesce(_comment,'')),'') IS NULL THEN RAISE EXCEPTION 'Add a comment for the requested changes'; END IF;
  SELECT * INTO d FROM public.marketing_post_drafts WHERE id = a.draft_id FOR UPDATE;
  IF public.marketing_draft_hash(d) <> a.content_hash THEN RAISE EXCEPTION 'The content changed after the request; ask again'; END IF;
  UPDATE public.marketing_post_approvals SET decision = _decision, comment = coalesce(nullif(btrim(coalesce(_comment,'')),''), comment), decided_at = now()
    WHERE id = _approval;
  PERFORM set_config('marketing.approval_rpc','on',true);
  UPDATE public.marketing_post_drafts
    SET status = CASE WHEN _decision = 'approved' THEN 'approved'::public.marketing_draft_status ELSE 'suggested'::public.marketing_draft_status END,
        decision_note = coalesce(nullif(btrim(coalesce(_comment,'')),''), decision_note)
    WHERE id = a.draft_id;
  PERFORM set_config('marketing.approval_rpc','off',true);
  IF public.has_module_permission(a.requested_by, 'marketing.view', 'all') THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
      VALUES (a.requested_by, 'marketing_post_approval_decided',
        CASE WHEN _decision = 'approved' THEN 'Publicação aprovada' ELSE 'Pedidas alterações à publicação' END,
        nullif(btrim(coalesce(_comment,'')),''), '/marketing/posts?draft=' || a.draft_id, 'marketing', 'marketing_post_approval', a.id, 'mpa-dec-' || a.id);
  END IF;
  RETURN a.draft_id;
END $$;

REVOKE ALL ON FUNCTION public.marketing_request_post_approval(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marketing_decide_post_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_request_post_approval(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_decide_post_approval(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.marketing_draft_name_rule_violation(public.marketing_post_drafts) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_draft_name_rule_violation(public.marketing_post_drafts) TO authenticated, service_role;
