-- =========================================================
-- CRM Phase 1: Opportunities → Quotes → Projects
-- =========================================================

-- 1. New enums ------------------------------------------------
CREATE TYPE public.crm_opportunity_stage AS ENUM
  ('lead', 'proposal', 'negotiation', 'won', 'lost');

CREATE TYPE public.crm_quote_status AS ENUM
  ('draft', 'sent', 'approved', 'rejected');

CREATE TYPE public.crm_fee_structure AS ENUM
  ('fixed', 'staged', 'monthly');

-- 2. crm_accounts --------------------------------------------
CREATE TABLE public.crm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  billing_details text,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_accounts_company_id_idx ON public.crm_accounts(company_id);

ALTER TABLE public.crm_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read crm_accounts"
  ON public.crm_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert crm_accounts"
  ON public.crm_accounts FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update crm_accounts"
  ON public.crm_accounts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete crm_accounts"
  ON public.crm_accounts FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_crm_accounts_updated_at
  BEFORE UPDATE ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. crm_opportunities ---------------------------------------
CREATE TABLE public.crm_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  primary_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  stage public.crm_opportunity_stage NOT NULL DEFAULT 'lead',
  estimated_fee numeric NOT NULL DEFAULT 0,
  probability integer NOT NULL DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
  expected_start_date date,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_opportunities_company_id_idx ON public.crm_opportunities(company_id);
CREATE INDEX crm_opportunities_stage_idx ON public.crm_opportunities(stage);

ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read crm_opportunities"
  ON public.crm_opportunities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert crm_opportunities"
  ON public.crm_opportunities FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update crm_opportunities"
  ON public.crm_opportunities FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete crm_opportunities"
  ON public.crm_opportunities FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_crm_opportunities_updated_at
  BEFORE UPDATE ON public.crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. fee_proposals → Quotes (additive) -----------------------
ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fee_structure_type public.crm_fee_structure NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS quote_status public.crm_quote_status NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS fee_proposals_opportunity_id_idx ON public.fee_proposals(opportunity_id);
CREATE INDEX IF NOT EXISTS fee_proposals_account_id_idx ON public.fee_proposals(account_id);

-- 5. Backfill: 1:1 shadow opportunity per existing proposal --
DO $$
DECLARE
  r record;
  new_opp_id uuid;
  fallback_company uuid;
BEGIN
  FOR r IN SELECT * FROM public.fee_proposals WHERE opportunity_id IS NULL LOOP
    -- crm_opportunities.company_id is NOT NULL; if proposal has none, pick/create a fallback
    IF r.company_id IS NULL THEN
      SELECT id INTO fallback_company FROM public.companies
        WHERE nome = '— Sem empresa (legacy) —' LIMIT 1;
      IF fallback_company IS NULL THEN
        INSERT INTO public.companies (nome, status, notas)
          VALUES ('— Sem empresa (legacy) —', 'inactivo',
                  'Auto-criado para retro-preencher oportunidades sem empresa.')
          RETURNING id INTO fallback_company;
      END IF;
    ELSE
      fallback_company := r.company_id;
    END IF;

    INSERT INTO public.crm_opportunities
      (name, company_id, primary_contact_id, stage, estimated_fee, probability,
       expected_start_date, notas, created_by, created_at)
    VALUES
      (r.titulo, fallback_company, r.contact_id,
       CASE r.pipeline_status
         WHEN 'lead' THEN 'lead'
         WHEN 'proposta_enviada' THEN 'proposal'
         WHEN 'negociacao' THEN 'negotiation'
         WHEN 'ganho' THEN 'won'
         WHEN 'perdido' THEN 'lost'
       END::public.crm_opportunity_stage,
       r.valor, r.probabilidade, r.data_proposta, r.notas, r.created_by, r.created_at)
    RETURNING id INTO new_opp_id;

    UPDATE public.fee_proposals
      SET opportunity_id = new_opp_id,
          quote_status = CASE r.pipeline_status
            WHEN 'ganho' THEN 'approved'::public.crm_quote_status
            WHEN 'perdido' THEN 'rejected'::public.crm_quote_status
            WHEN 'proposta_enviada' THEN 'sent'::public.crm_quote_status
            ELSE 'draft'::public.crm_quote_status
          END
      WHERE id = r.id;
  END LOOP;
END $$;

-- 6. Approval guard: account_id required when quote_status='approved'
CREATE OR REPLACE FUNCTION public.fee_proposals_validate_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.quote_status = 'approved' AND NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'Cannot approve quote: account_id is required when quote_status = approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_proposals_validate_approval_trg ON public.fee_proposals;
CREATE TRIGGER fee_proposals_validate_approval_trg
  BEFORE INSERT OR UPDATE ON public.fee_proposals
  FOR EACH ROW EXECUTE FUNCTION public.fee_proposals_validate_approval();

-- 7. pm_projects: commercial links ---------------------------
ALTER TABLE public.pm_projects
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.fee_proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pm_projects_company_id_idx ON public.pm_projects(company_id);
CREATE INDEX IF NOT EXISTS pm_projects_account_id_idx ON public.pm_projects(account_id);
CREATE INDEX IF NOT EXISTS pm_projects_quote_id_idx ON public.pm_projects(quote_id);
CREATE INDEX IF NOT EXISTS pm_projects_opportunity_id_idx ON public.pm_projects(opportunity_id);

-- 8. Mark legacy projects table as deprecated ----------------
COMMENT ON TABLE public.projects IS
  'DEPRECATED — legacy CRM-side projects. Use pm_projects with quote_id/account_id/company_id/opportunity_id. Slated for removal after data migration.';
