
CREATE OR REPLACE FUNCTION public.import_financial_data(
  p_import_type text,
  p_file_name text,
  p_file_checksum text,
  p_source_file_size_bytes bigint DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_suppliers jsonb DEFAULT '[]'::jsonb,
  p_clients jsonb DEFAULT '[]'::jsonb,
  p_bank_accounts jsonb DEFAULT '[]'::jsonb,
  p_debts jsonb DEFAULT '[]'::jsonb,
  p_periods jsonb DEFAULT '[]'::jsonb,
  p_expenses jsonb DEFAULT '[]'::jsonb,
  p_income jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_log_id uuid;
  v_rows_suppliers int := 0;
  v_rows_clients int := 0;
  v_rows_bank_accounts int := 0;
  v_rows_debts int := 0;
  v_rows_expenses int := 0;
  v_rows_income int := 0;
BEGIN
  -- Authorization: admins only
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can run financial imports' USING ERRCODE = '42501';
  END IF;

  IF p_file_checksum IS NULL OR length(p_file_checksum) = 0 THEN
    RAISE EXCEPTION 'file_checksum is required for server-side import' USING ERRCODE = '22023';
  END IF;

  -- 1. Pre-check for duplicate file
  SELECT id, imported_at, file_name
    INTO v_existing
  FROM public.financial_import_logs
  WHERE import_type = p_import_type
    AND file_checksum = p_file_checksum
  ORDER BY imported_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'message', 'This file has already been imported',
      'existing_import', jsonb_build_object(
        'imported_at', v_existing.imported_at,
        'file_name', v_existing.file_name
      )
    );
  END IF;

  -- 2. Insert data rows (all inside this function = single transaction)

  -- Suppliers
  IF jsonb_array_length(COALESCE(p_suppliers, '[]'::jsonb)) > 0 THEN
    WITH ins AS (
      INSERT INTO public.financial_suppliers (name, nif, notes, is_active)
      SELECT
        x->>'name',
        x->>'nif',
        x->>'notes',
        COALESCE((x->>'is_active')::boolean, true)
      FROM jsonb_array_elements(p_suppliers) x
      WHERE COALESCE(x->>'name','') <> ''
      RETURNING 1
    )
    SELECT count(*) INTO v_rows_suppliers FROM ins;
  END IF;

  -- Clients
  IF jsonb_array_length(COALESCE(p_clients, '[]'::jsonb)) > 0 THEN
    WITH ins AS (
      INSERT INTO public.financial_clients (name, notes, is_active)
      SELECT
        x->>'name',
        x->>'notes',
        COALESCE((x->>'is_active')::boolean, true)
      FROM jsonb_array_elements(p_clients) x
      WHERE COALESCE(x->>'name','') <> ''
      RETURNING 1
    )
    SELECT count(*) INTO v_rows_clients FROM ins;
  END IF;

  -- Bank accounts
  IF jsonb_array_length(COALESCE(p_bank_accounts, '[]'::jsonb)) > 0 THEN
    WITH ins AS (
      INSERT INTO public.bank_accounts (account_name, bank_name, currency, is_active, notes)
      SELECT
        x->>'account_name',
        x->>'bank_name',
        COALESCE(x->>'currency','EUR'),
        COALESCE((x->>'is_active')::boolean, true),
        x->>'notes'
      FROM jsonb_array_elements(p_bank_accounts) x
      WHERE COALESCE(x->>'account_name','') <> ''
      RETURNING 1
    )
    SELECT count(*) INTO v_rows_bank_accounts FROM ins;
  END IF;

  -- Debts
  IF jsonb_array_length(COALESCE(p_debts, '[]'::jsonb)) > 0 THEN
    WITH ins AS (
      INSERT INTO public.financial_debts (creditor_name, description, original_amount, outstanding_amount, start_date, end_date, notes)
      SELECT
        x->>'creditor_name',
        x->>'description',
        COALESCE((x->>'original_amount')::numeric, 0),
        COALESCE((x->>'outstanding_amount')::numeric, 0),
        NULLIF(x->>'start_date','')::date,
        NULLIF(x->>'end_date','')::date,
        x->>'notes'
      FROM jsonb_array_elements(p_debts) x
      WHERE COALESCE(x->>'creditor_name','') <> ''
      RETURNING 1
    )
    SELECT count(*) INTO v_rows_debts FROM ins;
  END IF;

  -- Periods (idempotent on (year, month) if you have a unique index; otherwise plain insert)
  IF jsonb_array_length(COALESCE(p_periods, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.financial_periods (year, month, month_name, opening_balance, notes)
    SELECT
      (x->>'year')::int,
      (x->>'month')::int,
      x->>'month_name',
      COALESCE((x->>'opening_balance')::numeric, 0),
      x->>'notes'
    FROM jsonb_array_elements(p_periods) x
    WHERE x ? 'year' AND x ? 'month';
  END IF;

  -- Expenses
  IF jsonb_array_length(COALESCE(p_expenses, '[]'::jsonb)) > 0 THEN
    WITH ins AS (
      INSERT INTO public.financial_expense_items (
        description, expense_type, amount_ex_vat, vat_rate,
        due_date, paid_date, notes
      )
      SELECT
        x->>'description',
        COALESCE((x->>'expense_type')::financial_expense_type, 'operational'::financial_expense_type),
        COALESCE((x->>'amount_ex_vat')::numeric, 0),
        COALESCE((x->>'vat_rate')::numeric, 23),
        NULLIF(x->>'due_date','')::date,
        NULLIF(x->>'paid_date','')::date,
        x->>'notes'
      FROM jsonb_array_elements(p_expenses) x
      WHERE COALESCE(x->>'description','') <> ''
      RETURNING 1
    )
    SELECT count(*) INTO v_rows_expenses FROM ins;
  END IF;

  -- Income
  IF jsonb_array_length(COALESCE(p_income, '[]'::jsonb)) > 0 THEN
    WITH ins AS (
      INSERT INTO public.financial_income_items (
        description, project_name, project_code,
        amount_ex_vat, vat_rate,
        issue_date, expected_payment_date, paid_date,
        invoice_number, notes
      )
      SELECT
        x->>'description',
        x->>'project_name',
        x->>'project_code',
        COALESCE((x->>'amount_ex_vat')::numeric, 0),
        COALESCE((x->>'vat_rate')::numeric, 23),
        NULLIF(x->>'issue_date','')::date,
        NULLIF(x->>'expected_payment_date','')::date,
        NULLIF(x->>'paid_date','')::date,
        x->>'invoice_number',
        x->>'notes'
      FROM jsonb_array_elements(p_income) x
      WHERE COALESCE(x->>'description','') <> ''
      RETURNING 1
    )
    SELECT count(*) INTO v_rows_income FROM ins;
  END IF;

  -- 3. Record the import log. Unique index on (import_type, file_checksum)
  --    is the final guard against races. On 23505 we translate to duplicate.
  BEGIN
    INSERT INTO public.financial_import_logs (
      import_type, file_name, file_checksum, source_file_size_bytes,
      rows_expenses, rows_income, rows_suppliers, rows_clients, rows_debts, rows_bank_accounts,
      notes, created_by
    ) VALUES (
      p_import_type, p_file_name, p_file_checksum, p_source_file_size_bytes,
      v_rows_expenses, v_rows_income, v_rows_suppliers, v_rows_clients, v_rows_debts, v_rows_bank_accounts,
      p_notes, auth.uid()
    )
    RETURNING id INTO v_log_id;
  EXCEPTION WHEN unique_violation THEN
    -- Race: another transaction inserted the same checksum between our pre-check and now.
    -- Re-fetch the existing log; raising here rolls back ALL inserts above.
    SELECT id, imported_at, file_name
      INTO v_existing
    FROM public.financial_import_logs
    WHERE import_type = p_import_type
      AND file_checksum = p_file_checksum
    ORDER BY imported_at DESC
    LIMIT 1;

    RAISE EXCEPTION 'duplicate_import:%', COALESCE(v_existing.id::text, '')
      USING ERRCODE = '23505',
            DETAIL = jsonb_build_object(
              'status', 'duplicate',
              'message', 'This file has already been imported',
              'existing_import', jsonb_build_object(
                'imported_at', v_existing.imported_at,
                'file_name', v_existing.file_name
              )
            )::text;
  END;

  RETURN jsonb_build_object(
    'status', 'inserted',
    'log_id', v_log_id,
    'rows', jsonb_build_object(
      'suppliers', v_rows_suppliers,
      'clients', v_rows_clients,
      'bank_accounts', v_rows_bank_accounts,
      'debts', v_rows_debts,
      'expenses', v_rows_expenses,
      'income', v_rows_income
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_financial_data(text, text, text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_financial_data(text, text, text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;
