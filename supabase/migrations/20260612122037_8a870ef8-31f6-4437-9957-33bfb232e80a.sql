
-- 1) quote_stages: hierarchy + role + supplier link
ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS parent_stage_id uuid NULL REFERENCES public.quote_stages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stage_role text NOT NULL DEFAULT 'architecture',
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_stage_id uuid NULL REFERENCES public.quote_stages(id) ON DELETE SET NULL;

ALTER TABLE public.quote_stages
  DROP CONSTRAINT IF EXISTS quote_stages_role_chk;
ALTER TABLE public.quote_stages
  ADD CONSTRAINT quote_stages_role_chk
  CHECK (stage_role IN ('architecture','supplier_group','supplier_phase'));

CREATE INDEX IF NOT EXISTS idx_quote_stages_parent ON public.quote_stages(parent_stage_id);
CREATE INDEX IF NOT EXISTS idx_quote_stages_supplier ON public.quote_stages(supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_quote_stages_linked ON public.quote_stages(linked_stage_id);

-- 2) quote_payment_schedule_items: direction + supplier + linked inflow
ALTER TABLE public.quote_payment_schedule_items
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inflow',
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_payment_item_id uuid NULL REFERENCES public.quote_payment_schedule_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_offset_days integer NOT NULL DEFAULT 0;

ALTER TABLE public.quote_payment_schedule_items
  DROP CONSTRAINT IF EXISTS quote_pay_direction_chk;
ALTER TABLE public.quote_payment_schedule_items
  ADD CONSTRAINT quote_pay_direction_chk
  CHECK (direction IN ('inflow','outflow'));

CREATE INDEX IF NOT EXISTS idx_quote_pay_supplier ON public.quote_payment_schedule_items(supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_quote_pay_linked ON public.quote_payment_schedule_items(linked_payment_item_id);
CREATE INDEX IF NOT EXISTS idx_quote_pay_direction ON public.quote_payment_schedule_items(quote_id, direction);

-- 3) quote_supplier_phase_splits: per-supplier % overrides
CREATE TABLE IF NOT EXISTS public.quote_supplier_phase_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  supplier_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  linked_stage_id uuid NOT NULL REFERENCES public.quote_stages(id) ON DELETE CASCADE,
  percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, supplier_company_id, linked_stage_id),
  CHECK (percent >= 0 AND percent <= 100)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_supplier_phase_splits TO authenticated;
GRANT ALL ON public.quote_supplier_phase_splits TO service_role;

ALTER TABLE public.quote_supplier_phase_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read quote_supplier_phase_splits"
  ON public.quote_supplier_phase_splits FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins insert quote_supplier_phase_splits"
  ON public.quote_supplier_phase_splits FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update quote_supplier_phase_splits"
  ON public.quote_supplier_phase_splits FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete quote_supplier_phase_splits"
  ON public.quote_supplier_phase_splits FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_quote_supplier_phase_splits_updated_at
  BEFORE UPDATE ON public.quote_supplier_phase_splits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_qsps_quote ON public.quote_supplier_phase_splits(quote_id);
CREATE INDEX IF NOT EXISTS idx_qsps_supplier ON public.quote_supplier_phase_splits(supplier_company_id);
