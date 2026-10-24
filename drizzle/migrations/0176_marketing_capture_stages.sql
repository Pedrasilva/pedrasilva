CREATE OR REPLACE VIEW public.marketing_capture_draft_links WITH (security_invoker = true) AS
SELECT c.id AS capture_id, d.id AS draft_id, d.request_id, d.platform::text AS platform, d.status::text AS status, d.scheduled_at, d.format
FROM public.marketing_captures c
JOIN public.marketing_post_drafts d
  ON c.id = ANY (d.capture_ids)
  OR EXISTS (SELECT 1 FROM public.marketing_capture_assets a WHERE a.capture_id = c.id AND a.id = ANY (d.asset_ids));

CREATE OR REPLACE VIEW public.marketing_capture_stages WITH (security_invoker = true) AS
SELECT c.id AS capture_id,
  CASE
    WHEN c.status = 'archived' THEN 'archived'
    WHEN bool_or(l.status = 'published') THEN 'published'
    WHEN bool_or(l.status IN ('scheduled', 'publishing') OR (l.status = 'approved' AND l.scheduled_at IS NOT NULL)) THEN 'scheduled'
    WHEN bool_or(l.status IS NOT NULL AND l.status <> 'rejected') THEN 'in_planner'
    WHEN c.status = 'used' THEN 'published'
    WHEN c.status = 'new' THEN 'new'
    ELSE 'to_curate'
  END AS stage,
  count(l.draft_id) FILTER (WHERE l.status <> 'rejected')::int AS post_count,
  min(l.scheduled_at) FILTER (WHERE l.status IN ('scheduled', 'publishing', 'approved') AND l.scheduled_at IS NOT NULL) AS next_scheduled_at
FROM public.marketing_captures c
LEFT JOIN public.marketing_capture_draft_links l ON l.capture_id = c.id
GROUP BY c.id, c.status;

GRANT SELECT ON public.marketing_capture_draft_links TO authenticated;
GRANT SELECT ON public.marketing_capture_stages TO authenticated;
GRANT SELECT ON public.marketing_capture_draft_links TO service_role;
GRANT SELECT ON public.marketing_capture_stages TO service_role;