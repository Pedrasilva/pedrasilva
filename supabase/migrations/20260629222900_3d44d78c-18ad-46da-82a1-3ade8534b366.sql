
-- =============================================================
-- PSA Proposal Composer — Phase 1: schema + library seed
-- Additive; does not touch quote_proposal_documents or proposal_blocks.
-- =============================================================

-- ---------- enums ----------
CREATE TYPE public.psa_proposal_status AS ENUM ('draft','review','sent','accepted','declined','archived');
CREATE TYPE public.psa_block_type AS ENUM (
  'cover','index','about','scope','stage_list','stage_item','timeline',
  'consultants','fee_table','construction_fee','payment_terms',
  'payment_schedule','additional_services','general','suspension',
  'exclusions','acceptance','custom_text','page_break'
);
CREATE TYPE public.psa_block_source_type AS ENUM ('manual','library','live_quote','mixed','contract_clause');
CREATE TYPE public.psa_contract_relevance AS ENUM ('proposal_only','contract_relevant','both','internal_only');

-- ---------- updated_at helper (reuse if present) ----------
CREATE OR REPLACE FUNCTION public.psa_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- psa_proposals ----------
CREATE TABLE public.psa_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NULL REFERENCES public.fee_proposals(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Proposta',
  status public.psa_proposal_status NOT NULL DEFAULT 'draft',
  client_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  vat_mode text NULL,
  language text NOT NULL DEFAULT 'pt-PT',
  created_by uuid NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_psa_proposals_quote ON public.psa_proposals(quote_id);
CREATE INDEX idx_psa_proposals_status ON public.psa_proposals(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.psa_proposals TO authenticated;
GRANT ALL ON public.psa_proposals TO service_role;

ALTER TABLE public.psa_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psa_proposals_auth_all" ON public.psa_proposals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_psa_proposals_updated_at
  BEFORE UPDATE ON public.psa_proposals
  FOR EACH ROW EXECUTE FUNCTION public.psa_set_updated_at();

-- ---------- psa_proposal_blocks ----------
CREATE TABLE public.psa_proposal_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.psa_proposals(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  block_type public.psa_block_type NOT NULL,
  title text NOT NULL DEFAULT '',
  source_type public.psa_block_source_type NOT NULL DEFAULT 'manual',
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_rich jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_relevance public.psa_contract_relevance NOT NULL DEFAULT 'proposal_only',
  is_visible boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_psa_blocks_proposal ON public.psa_proposal_blocks(proposal_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.psa_proposal_blocks TO authenticated;
GRANT ALL ON public.psa_proposal_blocks TO service_role;

ALTER TABLE public.psa_proposal_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psa_blocks_auth_all" ON public.psa_proposal_blocks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_psa_blocks_updated_at
  BEFORE UPDATE ON public.psa_proposal_blocks
  FOR EACH ROW EXECUTE FUNCTION public.psa_set_updated_at();

-- ---------- psa_block_library ----------
CREATE TABLE public.psa_block_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.psa_block_type NOT NULL,
  label text NOT NULL,
  default_title text NOT NULL DEFAULT '',
  default_content_rich jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_source_type public.psa_block_source_type NOT NULL DEFAULT 'manual',
  default_source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_contract_relevance public.psa_contract_relevance NOT NULL DEFAULT 'proposal_only',
  sort_hint integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.psa_block_library TO authenticated;
GRANT ALL ON public.psa_block_library TO service_role;

ALTER TABLE public.psa_block_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psa_lib_read" ON public.psa_block_library
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_psa_lib_updated_at
  BEFORE UPDATE ON public.psa_block_library
  FOR EACH ROW EXECUTE FUNCTION public.psa_set_updated_at();

-- ---------- psa_proposal_audit ----------
CREATE TABLE public.psa_proposal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.psa_proposals(id) ON DELETE CASCADE,
  actor uuid NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_psa_audit_proposal ON public.psa_proposal_audit(proposal_id, created_at DESC);

GRANT SELECT, INSERT ON public.psa_proposal_audit TO authenticated;
GRANT ALL ON public.psa_proposal_audit TO service_role;

ALTER TABLE public.psa_proposal_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psa_audit_auth_read" ON public.psa_proposal_audit
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "psa_audit_auth_insert" ON public.psa_proposal_audit
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------- seed library (17 default PSA blocks in canonical order) ----------
INSERT INTO public.psa_block_library (kind, label, default_title, default_source_type, default_contract_relevance, sort_hint) VALUES
  ('cover',              'Cover',                       'Capa',                             'live_quote', 'both',              10),
  ('index',              'Index',                       'Índice',                           'manual',     'proposal_only',     20),
  ('about',              'About PSA',                   'Sobre a PSA',                      'library',    'proposal_only',     30),
  ('scope',              'Scope & Project Description', 'Âmbito e Descrição do Projeto',    'mixed',      'both',              40),
  ('stage_list',         'Project Organization & Stages','Organização do Projeto e Fases',  'live_quote', 'both',              50),
  ('stage_item',         'Individual Stage',            'Fase',                             'live_quote', 'both',              55),
  ('timeline',           'Timeline',                    'Cronograma',                       'live_quote', 'contract_relevant', 60),
  ('consultants',        'Consultants Sub-Contracting', 'Consultores e Subcontratação',     'live_quote', 'both',              70),
  ('fee_table',          'Fee Proposal',                'Proposta de Honorários',           'live_quote', 'both',              80),
  ('construction_fee',   'Construction-Stage Fee',      'Honorários em Obra',               'live_quote', 'both',              85),
  ('payment_terms',      'Payment Terms',               'Condições de Pagamento',           'library',    'contract_relevant', 90),
  ('payment_schedule',   'Payment Schedule',            'Plano de Pagamentos',              'live_quote', 'contract_relevant', 95),
  ('additional_services','Additional Services',         'Serviços Adicionais',              'library',    'proposal_only',    100),
  ('general',            'General Considerations',      'Considerações Gerais',             'library',    'contract_relevant',110),
  ('suspension',         'Suspension or Termination',   'Suspensão ou Rescisão',            'library',    'contract_relevant',120),
  ('exclusions',         'Exclusions',                  'Exclusões',                        'mixed',      'both',             130),
  ('acceptance',         'Validity & Acceptance',       'Validade e Aceitação',             'library',    'contract_relevant',140);
