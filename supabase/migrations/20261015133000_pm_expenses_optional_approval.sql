ALTER TABLE public.pm_expenses
  ADD COLUMN IF NOT EXISTS submitted_by uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS submitted_by_collaborator_id uuid DEFAULT public.get_my_collaborator_id(),
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'not_required'
    CHECK (approval_state IN ('not_required','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approval_requested_from uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_decided_by uuid,
  ADD COLUMN IF NOT EXISTS approval_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text;

CREATE INDEX IF NOT EXISTS idx_pm_expenses_submitted_by ON public.pm_expenses(submitted_by);
CREATE INDEX IF NOT EXISTS idx_pm_expenses_approval_from ON public.pm_expenses(approval_requested_from) WHERE approval_state = 'pending';

CREATE OR REPLACE FUNCTION public.pm_expenses_lock_submitter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.submitted_by IS NOT NULL THEN
    NEW.submitted_by := OLD.submitted_by;
    NEW.submitted_by_collaborator_id := OLD.submitted_by_collaborator_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pm_expenses_lock_submitter_trg ON public.pm_expenses;
CREATE TRIGGER pm_expenses_lock_submitter_trg
BEFORE UPDATE ON public.pm_expenses
FOR EACH ROW EXECUTE FUNCTION public.pm_expenses_lock_submitter();

DROP POLICY IF EXISTS "Admins read pm_expenses"   ON public.pm_expenses;
DROP POLICY IF EXISTS "Admins insert pm_expenses" ON public.pm_expenses;
DROP POLICY IF EXISTS "Admins update pm_expenses" ON public.pm_expenses;
DROP POLICY IF EXISTS "Admins delete pm_expenses" ON public.pm_expenses;

CREATE POLICY "pm_expenses select" ON public.pm_expenses FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_module_permission(auth.uid(),'projects.view_financials','all')
  OR submitted_by = auth.uid()
  OR approval_requested_from = public.get_my_collaborator_id()
);

CREATE POLICY "pm_expenses insert" ON public.pm_expenses FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR (
    submitted_by = auth.uid()
    AND approval_state = 'not_required'
    AND status IN ('draft','submitted')
    AND invoiced_at IS NULL
    AND public.pm_has_assigned_access(auth.uid(), project_id)
  )
);

CREATE POLICY "pm_expenses update" ON public.pm_expenses FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_module_permission(auth.uid(),'projects.view_financials','all')
  OR (submitted_by = auth.uid()
      AND status IN ('draft','submitted')
      AND approval_state IN ('not_required','rejected')
      AND invoiced_at IS NULL)
);

CREATE POLICY "pm_expenses delete" ON public.pm_expenses FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR (submitted_by = auth.uid() AND status = 'draft')
);

-- Column guard. Server-side code without a user (auth.uid() NULL: service role, triggers from jobs) is trusted.
CREATE OR REPLACE FUNCTION public.pm_expenses_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_priv boolean;
BEGIN
  v_priv := auth.uid() IS NULL
         OR public.has_role(auth.uid(),'admin'::public.app_role)
         OR public.has_module_permission(auth.uid(),'projects.view_financials','all')
         OR coalesce(current_setting('app.pm_expense_rpc', true),'') = '1';
  IF v_priv THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','submitted') THEN
      RAISE EXCEPTION 'Only draft/submitted allowed on creation';
    END IF;
    NEW.submitted_by := auth.uid();
    NEW.submitted_by_collaborator_id := public.get_my_collaborator_id();
    NEW.approval_state := 'not_required';
    NEW.approval_requested_from := NULL;
    NEW.approval_requested_at := NULL;
    NEW.approval_decided_by := NULL;
    NEW.approval_decided_at := NULL;
    NEW.approval_note := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('draft','submitted') THEN
    RAISE EXCEPTION 'Only an approver can set this status';
  END IF;
  IF NEW.approval_state          IS DISTINCT FROM OLD.approval_state
  OR NEW.approval_requested_from IS DISTINCT FROM OLD.approval_requested_from
  OR NEW.approval_requested_at   IS DISTINCT FROM OLD.approval_requested_at
  OR NEW.approval_decided_by     IS DISTINCT FROM OLD.approval_decided_by
  OR NEW.approval_decided_at     IS DISTINCT FROM OLD.approval_decided_at
  OR NEW.approval_note           IS DISTINCT FROM OLD.approval_note
  OR NEW.invoiced_at             IS DISTINCT FROM OLD.invoiced_at
  OR NEW.invoice_reference       IS DISTINCT FROM OLD.invoice_reference
  OR NEW.invoiced_in_invoice_id  IS DISTINCT FROM OLD.invoiced_in_invoice_id THEN
    RAISE EXCEPTION 'Approval and invoicing fields can only be changed via the approval/invoicing actions';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pm_expenses_guard_trg ON public.pm_expenses;
CREATE TRIGGER pm_expenses_guard_trg
BEFORE INSERT OR UPDATE ON public.pm_expenses
FOR EACH ROW EXECUTE FUNCTION public.pm_expenses_guard();

CREATE OR REPLACE FUNCTION public.pm_expense_request_approval(p_expense_id uuid, p_approver uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.pm_expenses%ROWTYPE;
  v_admin boolean := public.has_role(auth.uid(),'admin'::public.app_role);
  v_me uuid := public.get_my_collaborator_id();
  v_user uuid; v_now timestamptz := now();
  v_sub text; v_proj text; v_appr text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO e FROM public.pm_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF NOT v_admin AND e.submitted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the submitter can request approval';
  END IF;
  IF e.status IN ('approved','paid') OR e.invoiced_at IS NOT NULL OR e.approval_state = 'approved' THEN
    RAISE EXCEPTION 'Expense is already approved, paid or invoiced';
  END IF;
  IF p_approver IS NULL OR p_approver = v_me THEN RAISE EXCEPTION 'Choose someone else to approve'; END IF;
  SELECT nome INTO v_appr FROM public.collaborators WHERE id = p_approver AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approver is not an active collaborator'; END IF;

  PERFORM set_config('app.pm_expense_rpc','1', true);
  UPDATE public.pm_expenses SET
    approval_state = 'pending', approval_requested_from = p_approver, approval_requested_at = v_now,
    approval_decided_by = NULL, approval_decided_at = NULL, approval_note = NULL,
    status = CASE WHEN status = 'draft' THEN 'submitted'::public.pm_expense_status ELSE status END
  WHERE id = p_expense_id;
  PERFORM set_config('app.pm_expense_rpc','', true);

  SELECT u.id INTO v_user FROM auth.users u JOIN public.collaborators c ON lower(u.email) = lower(c.email)
   WHERE c.id = p_approver LIMIT 1;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('notified', false, 'approver_name', v_appr);
  END IF;

  SELECT nome INTO v_sub FROM public.collaborators WHERE id = coalesce(e.submitted_by_collaborator_id, v_me);
  SELECT name INTO v_proj FROM public.pm_projects WHERE id = e.project_id;
  INSERT INTO public.notifications(user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
  VALUES (v_user, 'expense_approval_requested', 'Despesa para aprovar · Expense to approve',
    concat_ws(' · ', v_sub, e.description, to_char(coalesce(e.purchase_price,0), 'FM999G999G990D00') || ' €', v_proj),
    '/projects/' || e.project_id || '?tab=expenses', 'projects', 'pm_expense', e.id,
    'expense_approval_requested:' || e.id || ':' || floor(extract(epoch FROM v_now))::bigint)
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('notified', true, 'approver_name', v_appr);
END $$;

CREATE OR REPLACE FUNCTION public.pm_expense_decide_approval(p_expense_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.pm_expenses%ROWTYPE;
  v_now timestamptz := now(); v_dec text; v_note text := nullif(btrim(coalesce(p_note,'')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO e FROM public.pm_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF e.approval_state <> 'pending' THEN RAISE EXCEPTION 'No pending approval'; END IF;
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role)
     AND e.approval_requested_from IS DISTINCT FROM public.get_my_collaborator_id() THEN
    RAISE EXCEPTION 'Only the requested approver can decide';
  END IF;

  PERFORM set_config('app.pm_expense_rpc','1', true);
  UPDATE public.pm_expenses SET
    approval_state = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    status = CASE WHEN p_approve THEN 'approved'::public.pm_expense_status ELSE 'draft'::public.pm_expense_status END,
    approval_note = CASE WHEN p_approve THEN NULL ELSE v_note END,
    approval_decided_by = auth.uid(), approval_decided_at = v_now
  WHERE id = p_expense_id;
  PERFORM set_config('app.pm_expense_rpc','', true);

  IF e.submitted_by IS NOT NULL AND e.submitted_by <> auth.uid() THEN
    SELECT nome INTO v_dec FROM public.collaborators WHERE id = public.get_my_collaborator_id();
    INSERT INTO public.notifications(user_id, kind, title, body, link_path, module, entity_type, entity_id, dedupe_key)
    VALUES (e.submitted_by, 'expense_approval_decided',
      CASE WHEN p_approve THEN 'Despesa aprovada · Expense approved' ELSE 'Despesa rejeitada · Expense rejected' END,
      concat_ws(' · ', e.description, v_dec, CASE WHEN NOT p_approve THEN v_note END),
      '/projects/' || e.project_id || '?tab=expenses', 'projects', 'pm_expense', e.id,
      'expense_approval_decided:' || e.id || ':' || floor(extract(epoch FROM v_now))::bigint)
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('approved', p_approve);
END $$;

REVOKE ALL ON FUNCTION public.pm_expense_request_approval(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pm_expense_decide_approval(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_expense_request_approval(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_expense_decide_approval(uuid, boolean, text) TO authenticated;

DROP INDEX IF EXISTS public.idx_pm_expenses_ready_to_invoice;
CREATE INDEX idx_pm_expenses_ready_to_invoice ON public.pm_expenses (project_id)
  WHERE status IN ('submitted','approved','paid') AND rebillable = true AND invoiced_at IS NULL
    AND approval_state IN ('not_required','approved');