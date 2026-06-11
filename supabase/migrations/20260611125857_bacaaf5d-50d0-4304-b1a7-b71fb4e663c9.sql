
DO $$
DECLARE
  parent RECORD;
  i INT;
  m_start DATE;
  m_end DATE;
  child_id UUID;
  alloc RECORD;
  clamp_start DATE;
  clamp_end DATE;
BEGIN
  FOR parent IN
    SELECT s.*
    FROM public.pm_stages s
    WHERE s.stage_kind = 'retainer_monthly'
      AND s.retainer_anchor_month IS NOT NULL
      AND COALESCE(s.retainer_months, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.pm_stages c
        WHERE c.parent_stage_id = s.id AND c.stage_kind = 'retainer_month'
      )
  LOOP
    -- Fix parent end_date to span all months.
    UPDATE public.pm_stages
       SET start_date = date_trunc('month', parent.retainer_anchor_month)::date,
           end_date = (date_trunc('month', parent.retainer_anchor_month)
                       + (parent.retainer_months || ' months')::interval
                       - interval '1 day')::date
     WHERE id = parent.id;

    FOR i IN 0..(parent.retainer_months - 1) LOOP
      m_start := (date_trunc('month', parent.retainer_anchor_month) + (i || ' months')::interval)::date;
      m_end   := (date_trunc('month', m_start) + interval '1 month' - interval '1 day')::date;

      INSERT INTO public.pm_stages (
        project_id, parent_stage_id, name, start_date, end_date, color,
        sort_order, budget, stage_kind, billing_model,
        retainer_monthly_amount, retainer_anchor_month, retainer_months,
        retainer_capacity_hours_per_month, retainer_review_months, is_fee_only
      ) VALUES (
        parent.project_id, parent.id,
        to_char(m_start, 'Mon YYYY') || ' — ' || parent.name,
        m_start, m_end, COALESCE(parent.color, '#22c55e'),
        COALESCE(parent.sort_order, 0) * 1000 + i + 1,
        COALESCE(parent.retainer_monthly_amount, 0),
        'retainer_month', 'stage',
        0, NULL, NULL,
        COALESCE(parent.retainer_capacity_hours_per_month, 160),
        NULL, COALESCE(parent.is_fee_only, true)
      )
      RETURNING id INTO child_id;

      -- Clone any template allocations on the parent into the new child month.
      FOR alloc IN
        SELECT * FROM public.pm_allocations WHERE stage_id = parent.id
      LOOP
        clamp_start := GREATEST(alloc.start_date, m_start);
        clamp_end   := LEAST(alloc.end_date, m_end);
        IF clamp_start <= clamp_end THEN
          INSERT INTO public.pm_allocations (
            stage_id, resource_id, start_date, end_date, hours_per_day, status
          ) VALUES (
            child_id, alloc.resource_id, clamp_start, clamp_end,
            alloc.hours_per_day, 'committed'
          );
        END IF;
      END LOOP;
    END LOOP;

    -- Remove template allocations from the parent (they now live on children).
    DELETE FROM public.pm_allocations WHERE stage_id = parent.id;
  END LOOP;
END$$;
