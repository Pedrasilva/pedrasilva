-- =====================================================================
-- 1) Lock down SELECT to admins on tables containing PII / financial data
-- =====================================================================
DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOR tbl, pol IN
    SELECT * FROM (VALUES
      ('bank_accounts',                 'Authenticated read bank_accounts'),
      ('bank_balance_snapshots',        'Authenticated read bank_balance_snapshots'),
      ('companies',                     'Authenticated read companies'),
      ('contacts',                      'Authenticated read contacts'),
      ('financial_debt_payments',       'Authenticated read financial_debt_payments'),
      ('financial_debts',               'Authenticated read financial_debts'),
      ('financial_expense_items',       'Authenticated read financial_expense_items'),
      ('financial_income_items',        'Authenticated read financial_income_items'),
      ('financial_periods',             'Authenticated read financial_periods'),
      ('historical_time_entries',       'Authenticated read historical time entries'),
      ('pm_invoice_items',              'Authenticated read pm_invoice_items'),
      ('pm_invoices',                   'Authenticated read pm_invoices'),
      ('pm_project_rate_overrides',     'Authenticated read pm_project_rate_overrides'),
      ('pm_resource_rates',             'Authenticated read pm_resource_rates'),
      ('role_permissions',              'Authenticated read role permissions')
    ) AS t(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    EXECUTE format(
      'CREATE POLICY "Admins read %I" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))',
      tbl, tbl
    );
  END LOOP;
END $$;

-- user_role_assignments: admins read all, users read their own assignments
DROP POLICY IF EXISTS "Authenticated read role assignments" ON public.user_role_assignments;
CREATE POLICY "Admins or self read role assignments"
  ON public.user_role_assignments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

-- pm_resources: admins read all; non-admins still need basic team info
-- (name/color/role) for the planner — keep read but expose via a view that
-- omits cost_rate, sale_rate, hourly_rate, email, phone columns.
DROP POLICY IF EXISTS "Authenticated read pm_resources" ON public.pm_resources;
CREATE POLICY "Admins read pm_resources"
  ON public.pm_resources FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Public-safe view of resources for planning UI (no rate/PII columns).
-- Uses SECURITY INVOKER (default) so it relies on the caller's permissions.
CREATE OR REPLACE VIEW public.pm_resources_public AS
  SELECT id, name, color, role, collaborator_id, created_at, updated_at
  FROM public.pm_resources;

GRANT SELECT ON public.pm_resources_public TO authenticated;

-- =====================================================================
-- 2) Quote proposal documents: lock down writes to admins (read kept open)
-- =====================================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['quote_proposal_documents','quote_proposal_document_blocks'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated insert %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated update %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated delete %s" ON public.%I', tbl, tbl);

    EXECUTE format(
      'CREATE POLICY "Admins insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admins update %s" ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admins delete %s" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''))',
      tbl, tbl
    );
  END LOOP;
END $$;