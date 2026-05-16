-- =====================================================================
-- Phase 1a: HR Benefits — taxonomy, audit, state machine
-- Non-destructive: legacy enum `benefit_category` and column `categoria` stay.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Category taxonomy
-- ---------------------------------------------------------------------
CREATE TABLE public.benefit_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  label_pt    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  icon        TEXT,
  sort_order  INT  NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  -- Legacy mapping: which old enum value this category absorbs.
  -- Editable only via SQL/admin to avoid casual breakage.
  legacy_enum public.benefit_category,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each legacy enum value maps to exactly one category.
CREATE UNIQUE INDEX benefit_categories_legacy_enum_uq
  ON public.benefit_categories(legacy_enum)
  WHERE legacy_enum IS NOT NULL;

CREATE TRIGGER trg_benefit_categories_updated_at
  BEFORE UPDATE ON public.benefit_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.benefit_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read categories"
  ON public.benefit_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage categories"
  ON public.benefit_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed taxonomy (legacy mappings included per user spec)
INSERT INTO public.benefit_categories (code, label_pt, label_en, icon, sort_order, legacy_enum) VALUES
  ('electronics',          'Eletrónica',                'Electronics',              'laptop',       10, NULL),
  ('travel',               'Viagens',                   'Travel',                   'plane',        20, NULL),
  ('training',             'Formação',                  'Training',                 'graduation-cap', 30, NULL),
  ('wellness',             'Bem-estar',                 'Wellness',                 'heart',        40, NULL),
  ('home_office',          'Home Office',               'Home Office',              'home',         50, NULL),
  ('meals',                'Refeições',                 'Meals',                    'utensils',     60, 'ticket'),
  ('transport',            'Transportes',               'Transport',                'car',          70, 'carro'),
  ('professional_memberships', 'Quotas profissionais',  'Professional Memberships', 'badge',        80, NULL),
  ('software',             'Software',                  'Software',                 'monitor',      90, NULL),
  ('other',                'Outros',                    'Other',                    'package',     100, 'outros');

-- The 'premio' legacy value also maps to 'other' (per spec); add it as
-- a no-op secondary row would break the unique mapping, so we store it
-- on a small lookup table instead.
CREATE TABLE public.benefit_category_legacy_aliases (
  legacy_enum public.benefit_category PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.benefit_categories(id) ON DELETE RESTRICT
);
ALTER TABLE public.benefit_category_legacy_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read legacy aliases"
  ON public.benefit_category_legacy_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage legacy aliases"
  ON public.benefit_category_legacy_aliases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.benefit_category_legacy_aliases (legacy_enum, category_id)
SELECT 'carro'::public.benefit_category,  id FROM public.benefit_categories WHERE code = 'transport' UNION ALL
SELECT 'ticket'::public.benefit_category, id FROM public.benefit_categories WHERE code = 'meals'     UNION ALL
SELECT 'premio'::public.benefit_category, id FROM public.benefit_categories WHERE code = 'other'     UNION ALL
SELECT 'outros'::public.benefit_category, id FROM public.benefit_categories WHERE code = 'other';

-- Resolver: legacy enum -> category_id
CREATE OR REPLACE FUNCTION public.benefit_category_from_legacy(_legacy public.benefit_category)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT category_id FROM public.benefit_category_legacy_aliases WHERE legacy_enum = _legacy
$$;

-- ---------------------------------------------------------------------
-- 2. Add category_id FK columns (nullable, additive)
-- ---------------------------------------------------------------------
ALTER TABLE public.benefit_expenses
  ADD COLUMN category_id UUID REFERENCES public.benefit_categories(id) ON DELETE RESTRICT,
  ADD COLUMN pago_por    UUID;

ALTER TABLE public.benefit_balances
  ADD COLUMN category_id UUID REFERENCES public.benefit_categories(id) ON DELETE RESTRICT;

ALTER TABLE public.benefit_yearly_credits
  ADD COLUMN category_id UUID REFERENCES public.benefit_categories(id) ON DELETE RESTRICT;

-- Backfill from legacy enum
UPDATE public.benefit_expenses        SET category_id = public.benefit_category_from_legacy(categoria) WHERE category_id IS NULL;
UPDATE public.benefit_balances        SET category_id = public.benefit_category_from_legacy(categoria) WHERE category_id IS NULL;
UPDATE public.benefit_yearly_credits  SET category_id = public.benefit_category_from_legacy(categoria) WHERE category_id IS NULL;

CREATE INDEX idx_benefit_expenses_category_id       ON public.benefit_expenses(category_id);
CREATE INDEX idx_benefit_balances_category_id       ON public.benefit_balances(category_id);
CREATE INDEX idx_benefit_yearly_credits_category_id ON public.benefit_yearly_credits(category_id);

-- Helper view unifying old + new
CREATE OR REPLACE VIEW public.benefit_expenses_v AS
SELECT
  e.*,
  COALESCE(c.code, lc.code) AS category_code,
  COALESCE(c.label_pt, lc.label_pt) AS category_label_pt,
  COALESCE(c.label_en, lc.label_en) AS category_label_en
FROM public.benefit_expenses e
LEFT JOIN public.benefit_categories c ON c.id = e.category_id
LEFT JOIN public.benefit_categories lc
  ON lc.id = public.benefit_category_from_legacy(e.categoria);

-- ---------------------------------------------------------------------
-- 3. Audit trail
-- ---------------------------------------------------------------------
CREATE TABLE public.benefit_expense_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES public.benefit_expenses(id) ON DELETE CASCADE,
  actor_id    UUID,
  event_type  TEXT NOT NULL CHECK (event_type IN ('submitted','approved','rejected','paid','edited','reopened')),
  from_status public.expense_status,
  to_status   public.expense_status,
  notes       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_benefit_expense_events_expense ON public.benefit_expense_events(expense_id, created_at);

ALTER TABLE public.benefit_expense_events ENABLE ROW LEVEL SECURITY;

-- Read: owner of the parent expense, approvers, admins
CREATE POLICY "Read events for own expenses or approvers"
  ON public.benefit_expense_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_approve_benefits(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.benefit_expenses e
      WHERE e.id = expense_id
        AND e.collaborator_id = public.get_my_collaborator_id()
    )
  );
-- No INSERT/UPDATE/DELETE policies -> append-only via SECURITY DEFINER trigger only.

-- Audit trigger (SECURITY DEFINER so it bypasses the absent insert policy)
CREATE OR REPLACE FUNCTION public.benefit_expense_audit_trg()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.benefit_expense_events (expense_id, actor_id, event_type, to_status)
    VALUES (NEW.id, v_actor, 'submitted', NEW.estado);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      INSERT INTO public.benefit_expense_events (expense_id, actor_id, event_type, from_status, to_status, notes)
      VALUES (
        NEW.id, v_actor,
        CASE NEW.estado
          WHEN 'aprovada'  THEN 'approved'
          WHEN 'rejeitada' THEN 'rejected'
          WHEN 'paga'      THEN 'paid'
          WHEN 'pendente'  THEN 'reopened'
          ELSE 'edited'
        END,
        OLD.estado, NEW.estado,
        NULLIF(NEW.notas_aprovacao, OLD.notas_aprovacao)
      );
    ELSIF (NEW.descricao IS DISTINCT FROM OLD.descricao
        OR NEW.valor      IS DISTINCT FROM OLD.valor
        OR NEW.categoria  IS DISTINCT FROM OLD.categoria
        OR NEW.category_id IS DISTINCT FROM OLD.category_id
        OR NEW.data_despesa IS DISTINCT FROM OLD.data_despesa
        OR NEW.foto_path  IS DISTINCT FROM OLD.foto_path) THEN
      INSERT INTO public.benefit_expense_events (expense_id, actor_id, event_type, from_status, to_status)
      VALUES (NEW.id, v_actor, 'edited', OLD.estado, NEW.estado);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_benefit_expense_audit
AFTER INSERT OR UPDATE ON public.benefit_expenses
FOR EACH ROW EXECUTE FUNCTION public.benefit_expense_audit_trg();

-- Seed a baseline 'submitted' event for rows that existed before this migration
INSERT INTO public.benefit_expense_events (expense_id, actor_id, event_type, to_status, created_at)
SELECT e.id, NULL, 'submitted', 'pendente'::public.expense_status, e.created_at
FROM public.benefit_expenses e
WHERE NOT EXISTS (
  SELECT 1 FROM public.benefit_expense_events ev WHERE ev.expense_id = e.id
);

-- ---------------------------------------------------------------------
-- 4. Notification queue (future-ready seam; no cron yet)
-- ---------------------------------------------------------------------
CREATE TABLE public.benefit_notification_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID NOT NULL REFERENCES public.benefit_expenses(id) ON DELETE CASCADE,
  event        TEXT NOT NULL CHECK (event IN ('approved','rejected','paid')),
  audience     TEXT NOT NULL DEFAULT 'collaborator' CHECK (audience IN ('collaborator','accounting')),
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_benefit_notification_queue_unprocessed
  ON public.benefit_notification_queue(created_at) WHERE processed_at IS NULL;

ALTER TABLE public.benefit_notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read queue"
  ON public.benefit_notification_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update queue"
  ON public.benefit_notification_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
-- No INSERT policy: rows are produced by the trigger below (SECURITY DEFINER).

-- Trigger to enqueue notifications on status change
CREATE OR REPLACE FUNCTION public.benefit_notification_enqueue_trg()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado IN ('aprovada','rejeitada','paga') THEN
      INSERT INTO public.benefit_notification_queue (expense_id, event)
      VALUES (
        NEW.id,
        CASE NEW.estado
          WHEN 'aprovada'  THEN 'approved'
          WHEN 'rejeitada' THEN 'rejected'
          WHEN 'paga'      THEN 'paid'
        END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_benefit_notification_enqueue
AFTER UPDATE ON public.benefit_expenses
FOR EACH ROW EXECUTE FUNCTION public.benefit_notification_enqueue_trg();

-- ---------------------------------------------------------------------
-- 5. State machine helper + RLS tightening
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.benefit_expense_set_status(
  _expense_id UUID,
  _to_status  public.expense_status,
  _notes      TEXT DEFAULT NULL
) RETURNS public.benefit_expenses
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor    UUID := auth.uid();
  v_row      public.benefit_expenses;
  v_is_appr  BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.benefit_expenses WHERE id = _expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found';
  END IF;

  IF v_row.estado = _to_status THEN
    RAISE EXCEPTION 'no_op_transition: already %', _to_status;
  END IF;

  v_is_appr  := public.can_approve_benefits(v_actor);
  v_is_owner := v_row.collaborator_id = public.get_my_collaborator_id();

  -- Allowed transitions matrix
  IF v_row.estado = 'pendente' AND _to_status = 'aprovada' THEN
    IF NOT v_is_appr THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    UPDATE public.benefit_expenses
       SET estado = 'aprovada',
           aprovado_por = v_actor,
           aprovado_em  = now(),
           notas_aprovacao = COALESCE(_notes, notas_aprovacao)
     WHERE id = _expense_id
     RETURNING * INTO v_row;

  ELSIF v_row.estado = 'pendente' AND _to_status = 'rejeitada' THEN
    IF NOT v_is_appr THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    IF _notes IS NULL OR length(trim(_notes)) = 0 THEN
      RAISE EXCEPTION 'rejection_reason_required';
    END IF;
    UPDATE public.benefit_expenses
       SET estado = 'rejeitada',
           aprovado_por = v_actor,
           aprovado_em  = now(),
           notas_aprovacao = _notes
     WHERE id = _expense_id
     RETURNING * INTO v_row;

  ELSIF v_row.estado = 'aprovada' AND _to_status = 'paga' THEN
    IF NOT v_is_appr THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    UPDATE public.benefit_expenses
       SET estado  = 'paga',
           pago_em = now(),
           pago_por = v_actor,
           notas_aprovacao = COALESCE(_notes, notas_aprovacao)
     WHERE id = _expense_id
     RETURNING * INTO v_row;

  ELSIF v_row.estado = 'rejeitada' AND _to_status = 'pendente' THEN
    -- Owner reopen
    IF NOT (v_is_owner OR v_is_appr) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    UPDATE public.benefit_expenses
       SET estado = 'pendente',
           aprovado_por = NULL,
           aprovado_em  = NULL,
           notas_aprovacao = COALESCE(_notes, notas_aprovacao)
     WHERE id = _expense_id
     RETURNING * INTO v_row;

  ELSE
    RAISE EXCEPTION 'invalid_transition: % -> %', v_row.estado, _to_status;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.benefit_expense_set_status(UUID, public.expense_status, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.benefit_expense_set_status(UUID, public.expense_status, TEXT) TO authenticated;

-- Tighten direct UPDATE policy: collaborators may only edit their own
-- pending expenses; approvers/admins still need direct UPDATE for
-- credit/budget admin flows, so we keep that path open but route all
-- status changes through the function (RLS still permits it).
-- (Existing policy already covers this; no change needed.)
