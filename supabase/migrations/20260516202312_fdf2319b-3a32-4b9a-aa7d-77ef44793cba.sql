-- Phase 2b.5: Admin-only backfill for historical approved HR benefit expenses

-- 1. Dry-run preview
CREATE OR REPLACE FUNCTION public.benefit_expense_finance_backfill_preview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_total int;
  v_amount numeric;
  v_oldest date;
  v_newest date;
  v_with_period int;
  v_without_period int;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH eligible AS (
    SELECT e.id, e.valor, e.data_despesa,
           (date_trunc('month', e.data_despesa) + INTERVAL '1 month - 1 day')::date AS due_date
      FROM public.benefit_expenses e
     WHERE e.estado = 'aprovada'
       AND NOT EXISTS (
         SELECT 1 FROM public.financial_expense_items fei
          WHERE fei.source_ref_table = 'benefit_expenses'
            AND fei.source_ref_id    = e.id
       )
  )
  SELECT
    count(*),
    COALESCE(sum(valor), 0),
    min(data_despesa),
    max(data_despesa),
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM public.financial_periods p
         WHERE p.year = EXTRACT(YEAR FROM eligible.due_date)::int
           AND p.month = EXTRACT(MONTH FROM eligible.due_date)::int
           AND p.is_closed = false
      )
    ),
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_periods p
         WHERE p.year = EXTRACT(YEAR FROM eligible.due_date)::int
           AND p.month = EXTRACT(MONTH FROM eligible.due_date)::int
           AND p.is_closed = false
      )
    )
    INTO v_total, v_amount, v_oldest, v_newest, v_with_period, v_without_period
    FROM eligible;

  RETURN jsonb_build_object(
    'eligible',         v_total,
    'total_amount',     v_amount,
    'oldest_date',      v_oldest,
    'newest_date',      v_newest,
    'with_period',      v_with_period,
    'without_period',   v_without_period
  );
END;
$fn$;

-- 2. Execution
CREATE OR REPLACE FUNCTION public.benefit_expense_finance_backfill_run()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_row record;
  v_fei uuid;
  v_created int := 0;
  v_skipped int := 0;
  v_failed  int := 0;
  v_with_period int := 0;
  v_without_period int := 0;
  v_failures jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT e.id
      FROM public.benefit_expenses e
     WHERE e.estado = 'aprovada'
     ORDER BY e.data_despesa ASC
  LOOP
    -- Skip if already linked (idempotency safety beyond the unique index)
    IF EXISTS (
      SELECT 1 FROM public.financial_expense_items fei
       WHERE fei.source_ref_table = 'benefit_expenses'
         AND fei.source_ref_id    = v_row.id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_fei := public.benefit_expense_link_to_finance(v_row.id);
      v_created := v_created + 1;

      -- Tag this row as a backfill in the timeline event metadata
      UPDATE public.benefit_expense_events
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('backfill', true)
       WHERE expense_id = v_row.id
         AND event_type = 'finance_linked'
         AND (metadata->>'backfill') IS NULL;

      -- Count period match outcome on the just-created finance row
      IF EXISTS (
        SELECT 1 FROM public.financial_expense_items fei
         WHERE fei.id = v_fei AND fei.period_id IS NOT NULL
      ) THEN
        v_with_period := v_with_period + 1;
      ELSE
        v_without_period := v_without_period + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_object(
        'expense_id', v_row.id,
        'sqlstate',   SQLSTATE,
        'message',    SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'created',         v_created,
    'skipped',         v_skipped,
    'failed',          v_failed,
    'with_period',     v_with_period,
    'without_period',  v_without_period,
    'failures',        v_failures
  );
END;
$fn$;

-- Admin-only execution
REVOKE ALL ON FUNCTION public.benefit_expense_finance_backfill_preview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.benefit_expense_finance_backfill_run()     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.benefit_expense_finance_backfill_preview() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.benefit_expense_finance_backfill_run()     TO authenticated;