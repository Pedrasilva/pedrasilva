CREATE TABLE public.marketing_ig_comments (
  id text PRIMARY KEY,
  media_id text NOT NULL,
  parent_id text,
  username text,
  body text NOT NULL DEFAULT '',
  commented_at timestamptz,
  hidden boolean NOT NULL DEFAULT false,
  from_us boolean NOT NULL DEFAULT false,
  media_thumbnail text,
  media_permalink text,
  media_caption text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  read_by uuid
);
GRANT SELECT ON public.marketing_ig_comments TO authenticated;
GRANT ALL ON public.marketing_ig_comments TO service_role;
REVOKE TRUNCATE ON public.marketing_ig_comments FROM anon, authenticated;
ALTER TABLE public.marketing_ig_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mig_comments_read ON public.marketing_ig_comments FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE INDEX marketing_ig_comments_time_idx ON public.marketing_ig_comments (commented_at DESC);
CREATE INDEX marketing_ig_comments_unread_idx ON public.marketing_ig_comments (read_at) WHERE read_at IS NULL AND from_us = false;

CREATE TABLE public.marketing_ig_comment_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('reply','hide','unhide')),
  actor_id uuid NOT NULL,
  body text,
  ai_suggested boolean NOT NULL DEFAULT false,
  meta_result_id text,
  success boolean NOT NULL,
  meta_error_code text,
  meta_error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketing_ig_comment_actions TO authenticated;
GRANT ALL ON public.marketing_ig_comment_actions TO service_role;
REVOKE TRUNCATE ON public.marketing_ig_comment_actions FROM anon, authenticated;
ALTER TABLE public.marketing_ig_comment_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY mig_comment_actions_read ON public.marketing_ig_comment_actions FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(),'marketing.view','all'));
CREATE INDEX marketing_ig_comment_actions_comment_idx ON public.marketing_ig_comment_actions (comment_id, created_at DESC);

ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS instagram_comments_synced_at timestamptz;
ALTER TABLE public.marketing_settings ADD COLUMN IF NOT EXISTS instagram_comments_error text;

CREATE OR REPLACE FUNCTION public.marketing_mark_comments_read(_ids text[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.has_module_permission(auth.uid(),'marketing.view','all') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.marketing_ig_comments SET read_at = now(), read_by = auth.uid() WHERE id = ANY(_ids) AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.marketing_mark_comments_read(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_mark_comments_read(text[]) TO authenticated;