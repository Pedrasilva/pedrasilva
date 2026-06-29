
-- Backfill pm_stages.parent_stage_id from the source quote_stages hierarchy.
-- Match pm_stage <-> quote_stage by (project's quote_id, name, sort_order).
WITH q AS (
  SELECT
    qs.id          AS qs_id,
    qs.quote_id    AS quote_id,
    qs.name        AS qs_name,
    qs.sort_order  AS qs_sort,
    qsp.name       AS qsp_name,
    qsp.sort_order AS qsp_sort
  FROM quote_stages qs
  LEFT JOIN quote_stages qsp ON qsp.id = qs.parent_stage_id
  WHERE qs.parent_stage_id IS NOT NULL
),
m AS (
  SELECT
    ps.id        AS ps_id,
    pm_parent.id AS parent_id
  FROM pm_stages ps
  JOIN pm_projects p ON p.id = ps.project_id AND p.quote_id IS NOT NULL
  JOIN q ON q.quote_id = p.quote_id
       AND q.qs_name = ps.name
       AND q.qs_sort = ps.sort_order
  JOIN pm_stages pm_parent
       ON pm_parent.project_id = ps.project_id
      AND pm_parent.name = q.qsp_name
      AND pm_parent.sort_order = q.qsp_sort
  WHERE ps.parent_stage_id IS NULL
)
UPDATE pm_stages ps
SET parent_stage_id = m.parent_id
FROM m
WHERE ps.id = m.ps_id;
