
-- ============================================================
-- PSA Proposal Ontology — Milestone 1 Registry Layer
-- Additive only. No existing tables modified.
-- ============================================================

-- ---------- 1. proposal_families ----------
CREATE TABLE public.proposal_families (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label_en TEXT NOT NULL,
  label_pt TEXT NOT NULL,
  description TEXT,
  default_enabled_phases TEXT[] NOT NULL DEFAULT '{}',
  optional_phases TEXT[] NOT NULL DEFAULT '{}',
  default_planning_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_procurement_mode TEXT,
  default_delivery_mode TEXT,
  default_billing_topology JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 2. proposal_phases ----------
CREATE TABLE public.proposal_phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                    -- 'P0','P1',...,'P8_5','P9'
  display_code TEXT NOT NULL,                   -- 'P0','P1',...,'P8.5','P9'
  label_en TEXT NOT NULL,
  label_pt TEXT NOT NULL,
  description_en TEXT,
  description_pt TEXT,
  phase_class TEXT NOT NULL DEFAULT 'finite_milestone',
    -- finite_milestone | operational_recurring | parallel_addon
  default_order NUMERIC(5,2) NOT NULL,
  default_billing_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_optional_default BOOLEAN NOT NULL DEFAULT false,
  is_jurisdiction_specific BOOLEAN NOT NULL DEFAULT false,
  family_applicability TEXT[] NOT NULL DEFAULT '{}',
  jurisdiction_applicability TEXT[] NOT NULL DEFAULT '{}',
  operational_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposal_phases_order ON public.proposal_phases(default_order);

-- ---------- 3. proposal_phase_aliases ----------
CREATE TABLE public.proposal_phase_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phase_code TEXT NOT NULL REFERENCES public.proposal_phases(code) ON DELETE CASCADE,
  alias_set TEXT NOT NULL,        -- 'psa_internal' | 'riba' | 'portaria_255' | 'ccp'
  locale TEXT NOT NULL DEFAULT 'en',  -- 'en' | 'pt-PT'
  label TEXT NOT NULL,
  short_label TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phase_code, alias_set, locale)
);
CREATE INDEX idx_phase_aliases_lookup ON public.proposal_phase_aliases(alias_set, locale);

-- ---------- 4. proposal_addon_modules ----------
CREATE TABLE public.proposal_addon_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label_en TEXT NOT NULL,
  label_pt TEXT NOT NULL,
  description TEXT,
  default_billing_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  parallel_or_sequential TEXT NOT NULL DEFAULT 'parallel',  -- 'parallel' | 'sequential'
  default_consultant_ownership TEXT,                        -- 'psa' | 'external' | 'shared'
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 5. proposal_delivery_modes ----------
CREATE TABLE public.proposal_delivery_modes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,        -- 'psa_led' | 'psa_assist_local' | 'local_led_psa_oversight'
  label_en TEXT NOT NULL,
  label_pt TEXT NOT NULL,
  description_en TEXT,
  description_pt TEXT,
  operational_implications JSONB NOT NULL DEFAULT '{}'::jsonb,
  fee_scaling_hint NUMERIC(6,3),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 6. proposal_commercial_components ----------
CREATE TABLE public.proposal_commercial_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label_en TEXT NOT NULL,
  label_pt TEXT NOT NULL,
  description TEXT,
  component_kind TEXT NOT NULL,
    -- 'subcontracting' | 'reimbursable' | 'travel' | 'standby' | 'suspension' | 'procurement'
  default_billing_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_amount_type TEXT,         -- 'fixed' | 'percent' | 'rate'
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 7. proposal_flags ----------
CREATE TABLE public.proposal_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label_en TEXT NOT NULL,
  label_pt TEXT NOT NULL,
  description TEXT,
  flag_kind TEXT NOT NULL DEFAULT 'boolean',  -- 'boolean' | 'enum'
  default_value JSONB,
  enum_values JSONB,
  effects JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 8. proposal_presets ----------
CREATE TABLE public.proposal_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label_en TEXT NOT NULL,
  label_pt TEXT NOT NULL,
  description TEXT,
  family_code TEXT REFERENCES public.proposal_families(code) ON DELETE SET NULL,
  enabled_phases TEXT[] NOT NULL DEFAULT '{}',
  default_dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_delivery_mode TEXT,
  planning_topology JSONB NOT NULL DEFAULT '{}'::jsonb,
  procurement_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  bim_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  at_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_addons TEXT[] NOT NULL DEFAULT '{}',
  default_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS — read-only for authenticated users
-- ============================================================
ALTER TABLE public.proposal_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_phase_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_addon_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_delivery_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_commercial_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registry_read_families" ON public.proposal_families
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "registry_read_phases" ON public.proposal_phases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "registry_read_aliases" ON public.proposal_phase_aliases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "registry_read_addons" ON public.proposal_addon_modules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "registry_read_delivery_modes" ON public.proposal_delivery_modes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "registry_read_commercial" ON public.proposal_commercial_components
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "registry_read_flags" ON public.proposal_flags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "registry_read_presets" ON public.proposal_presets
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- updated_at triggers (reuse existing helper if present)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_proposal_registry_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_families_touch BEFORE UPDATE ON public.proposal_families
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_registry_touch();
CREATE TRIGGER trg_phases_touch BEFORE UPDATE ON public.proposal_phases
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_registry_touch();
CREATE TRIGGER trg_aliases_touch BEFORE UPDATE ON public.proposal_phase_aliases
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_registry_touch();
CREATE TRIGGER trg_addons_touch BEFORE UPDATE ON public.proposal_addon_modules
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_registry_touch();
CREATE TRIGGER trg_delivery_touch BEFORE UPDATE ON public.proposal_delivery_modes
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_registry_touch();
CREATE TRIGGER trg_commercial_touch BEFORE UPDATE ON public.proposal_commercial_components
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_registry_touch();
CREATE TRIGGER trg_flags_touch BEFORE UPDATE ON public.proposal_flags
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_registry_touch();
CREATE TRIGGER trg_presets_touch BEFORE UPDATE ON public.proposal_presets
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposal_registry_touch();

-- ============================================================
-- SEED DATA — idempotent (ON CONFLICT DO NOTHING on code)
-- ============================================================

-- ---- Phases (P0..P9 + P8.5) ----
INSERT INTO public.proposal_phases (code, display_code, label_en, label_pt, phase_class, default_order, is_optional_default, is_jurisdiction_specific, metadata) VALUES
  ('P0',   'P0',   'Workplace Strategy',              'Estratégia de Workplace',          'finite_milestone', 0,   true,  false, '{"riba_equivalent":"0"}'::jsonb),
  ('P1',   'P1',   'Strategic & Programme Definition','Definição Estratégica e Programa', 'finite_milestone', 1,   false, false, '{"riba_equivalent":"1"}'::jsonb),
  ('P2',   'P2',   'Concept Design',                  'Estudo Prévio',                    'finite_milestone', 2,   false, false, '{"riba_equivalent":"2"}'::jsonb),
  ('P3',   'P3',   'Licensing / PIP',                 'Licenciamento / PIP',              'finite_milestone', 3,   true,  true,  '{"jurisdiction":"PT"}'::jsonb),
  ('P4',   'P4',   'Developed / Anteprojeto',         'Anteprojeto',                      'finite_milestone', 4,   false, false, '{"riba_equivalent":"3"}'::jsonb),
  ('P5',   'P5',   'Technical / Execution Design',    'Projeto de Execução',              'finite_milestone', 5,   false, false, '{"riba_equivalent":"4"}'::jsonb),
  ('P6',   'P6',   'Procurement / Tender',            'Concurso / Procurement',           'finite_milestone', 6,   true,  false, '{"riba_equivalent":"4-5"}'::jsonb),
  ('P7',   'P7',   'Construction / Site Assistance',  'Assistência Técnica em Obra',      'operational_recurring', 7, false, false, '{"riba_equivalent":"5","is_at":true}'::jsonb),
  ('P8',   'P8',   'Close-Out / Handover',            'Conclusão / Entrega',              'finite_milestone', 8,   false, false, '{"riba_equivalent":"6"}'::jsonb),
  ('P8_5', 'P8.5', 'Telas Finais / As-built Review',  'Telas Finais',                     'finite_milestone', 8.5, true,  true,  '{"jurisdiction":"PT"}'::jsonb),
  ('P9',   'P9',   'FF&E / Signage / Lighting / AV',  'FF&E / Sinalética / Iluminação / AV','parallel_addon', 9,   true,  false, '{"riba_equivalent":"7"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- ---- Phase aliases (a starter set; expandable later) ----
INSERT INTO public.proposal_phase_aliases (phase_code, alias_set, locale, label, short_label) VALUES
  -- PSA internal EN/PT
  ('P0','psa_internal','en','Workplace Strategy','P0'),
  ('P0','psa_internal','pt-PT','Estratégia de Workplace','P0'),
  ('P1','psa_internal','en','Strategic & Programme Definition','P1'),
  ('P1','psa_internal','pt-PT','Definição Estratégica e Programa','P1'),
  ('P2','psa_internal','en','Concept Design','P2'),
  ('P2','psa_internal','pt-PT','Estudo Prévio','P2'),
  ('P3','psa_internal','en','Licensing','P3'),
  ('P3','psa_internal','pt-PT','Licenciamento','P3'),
  ('P4','psa_internal','en','Developed Design','P4'),
  ('P4','psa_internal','pt-PT','Anteprojeto','P4'),
  ('P5','psa_internal','en','Technical Design','P5'),
  ('P5','psa_internal','pt-PT','Projeto de Execução','P5'),
  ('P6','psa_internal','en','Procurement','P6'),
  ('P6','psa_internal','pt-PT','Procurement','P6'),
  ('P7','psa_internal','en','Site Assistance','P7'),
  ('P7','psa_internal','pt-PT','Assistência Técnica','P7'),
  ('P8','psa_internal','en','Close-Out','P8'),
  ('P8','psa_internal','pt-PT','Conclusão','P8'),
  ('P8_5','psa_internal','en','As-built Review','P8.5'),
  ('P8_5','psa_internal','pt-PT','Telas Finais','P8.5'),
  ('P9','psa_internal','en','FF&E / Add-ons','P9'),
  ('P9','psa_internal','pt-PT','FF&E / Add-ons','P9'),
  -- RIBA
  ('P0','riba','en','Stage 0 — Strategic Definition','RIBA 0'),
  ('P1','riba','en','Stage 1 — Preparation and Briefing','RIBA 1'),
  ('P2','riba','en','Stage 2 — Concept Design','RIBA 2'),
  ('P4','riba','en','Stage 3 — Spatial Coordination','RIBA 3'),
  ('P5','riba','en','Stage 4 — Technical Design','RIBA 4'),
  ('P6','riba','en','Stage 4/5 — Manufacturing & Construction','RIBA 4/5'),
  ('P7','riba','en','Stage 5 — Construction','RIBA 5'),
  ('P8','riba','en','Stage 6 — Handover','RIBA 6'),
  ('P9','riba','en','Stage 7 — Use','RIBA 7'),
  -- Portaria 255/2023 (PT)
  ('P2','portaria_255','pt-PT','Estudo Prévio','EP'),
  ('P3','portaria_255','pt-PT','Pedido de Informação Prévia','PIP'),
  ('P4','portaria_255','pt-PT','Anteprojeto / Projeto Base','AP'),
  ('P5','portaria_255','pt-PT','Projeto de Execução','PE'),
  ('P7','portaria_255','pt-PT','Assistência Técnica','AT'),
  ('P8_5','portaria_255','pt-PT','Telas Finais','TF'),
  -- CCP / public works
  ('P6','ccp','pt-PT','Procedimento de Contratação Pública','CCP'),
  ('P7','ccp','pt-PT','Fiscalização / Assistência Técnica','FAT')
ON CONFLICT (phase_code, alias_set, locale) DO NOTHING;

-- ---- Families ----
INSERT INTO public.proposal_families (code, label_en, label_pt, description, default_enabled_phases, optional_phases, default_delivery_mode, default_procurement_mode, sort_order) VALUES
  ('architecture',   'Architecture',     'Arquitetura',            'Standard architectural commissions',
    ARRAY['P1','P2','P4','P5','P7','P8'], ARRAY['P3','P6','P8_5','P9'], 'psa_led', 'open_market', 10),
  ('workplace',      'Workplace',        'Workplace',              'Office and workplace interiors',
    ARRAY['P1','P2','P4','P5','P7','P8','P9'], ARRAY['P0','P3','P6','P8_5'], 'psa_led', 'design_build', 20),
  ('hospitality',    'Hospitality',      'Hotelaria',              'Hotels, restaurants, resorts',
    ARRAY['P1','P2','P4','P5','P7','P8','P9'], ARRAY['P0','P3','P6','P8_5'], 'psa_led', 'open_market', 30),
  ('healthcare',     'Healthcare',       'Saúde',                  'Clinics, hospitals, healthcare facilities',
    ARRAY['P1','P2','P4','P5','P7','P8'], ARRAY['P3','P6','P8_5','P9'], 'psa_led', 'open_market', 40),
  ('interior_design','Interior Design',  'Design de Interiores',   'Standalone interior design commissions',
    ARRAY['P2','P4','P5','P7','P9'], ARRAY['P1','P8','P8_5'], 'psa_led', 'design_build', 50),
  ('strategy',       'Strategy',         'Estratégia',             'Workplace and brand strategy',
    ARRAY['P0','P1'], ARRAY['P2'], 'psa_led', 'na', 60),
  ('retainer',       'Retainer',         'Avença',                 'Recurring advisory / AT retainers',
    ARRAY['P7'], ARRAY[]::TEXT[], 'psa_led', 'na', 70),
  ('competition',    'Competition',      'Concurso',               'Design competitions',
    ARRAY['P1','P2'], ARRAY['P4'], 'psa_led', 'na', 80),
  ('due_diligence',  'Due Diligence',    'Due Diligence',          'Technical due diligence and feasibility',
    ARRAY['P1'], ARRAY['P2'], 'psa_led', 'na', 90)
ON CONFLICT (code) DO NOTHING;

-- ---- Delivery modes ----
INSERT INTO public.proposal_delivery_modes (code, label_en, label_pt, description_en, description_pt, fee_scaling_hint, sort_order) VALUES
  ('psa_led',                'PSA Led',                    'Liderado por PSA',
    'PSA produces all deliverables in-house.', 'PSA produz todos os entregáveis.', 1.000, 10),
  ('psa_assist_local',       'PSA Assist Local',           'PSA Assiste Local',
    'PSA supports a local partner producing deliverables.', 'PSA apoia um parceiro local que produz os entregáveis.', 0.650, 20),
  ('local_led_psa_oversight','Local Led / PSA Oversight',  'Local Lidera / PSA Supervisão',
    'Local team leads; PSA provides oversight and QA.', 'Equipa local lidera; PSA supervisiona e valida.', 0.350, 30)
ON CONFLICT (code) DO NOTHING;

-- ---- Add-on modules ----
INSERT INTO public.proposal_addon_modules (code, label_en, label_pt, parallel_or_sequential, default_consultant_ownership, sort_order) VALUES
  ('ffe',            'FF&E',             'FF&E',                'parallel',  'psa',      10),
  ('signage',        'Signage',          'Sinalética',          'parallel',  'psa',      20),
  ('lighting',       'Lighting Design',  'Design de Iluminação','parallel',  'external', 30),
  ('av',             'AV / Multimedia',  'AV / Multimédia',     'parallel',  'external', 40),
  ('bim_mgmt',       'BIM Management',   'Gestão BIM',          'parallel',  'psa',      50),
  ('sustainability', 'Sustainability',   'Sustentabilidade',    'parallel',  'external', 60),
  ('fire',           'Fire Engineering', 'Segurança Contra Incêndio','parallel','external', 70),
  ('acoustic',       'Acoustic',         'Acústica',            'parallel',  'external', 80),
  ('kitchens',       'Kitchens',         'Cozinhas',            'parallel',  'external', 90),
  ('spa',            'Spa',              'Spa',                 'parallel',  'external', 100),
  ('pool',           'Pool',             'Piscina',             'parallel',  'external', 110)
ON CONFLICT (code) DO NOTHING;

-- ---- Commercial components ----
INSERT INTO public.proposal_commercial_components (code, label_en, label_pt, component_kind, default_amount_type, sort_order) VALUES
  ('subcontracting',     'Consultant Subcontracting','Subcontratação de Consultores','subcontracting','percent', 10),
  ('reimbursables',      'Reimbursables',            'Reembolsáveis',                'reimbursable',  'fixed',   20),
  ('travel_allowance',   'Travel Allowance',         'Ajuda de Custo de Viagem',     'travel',        'fixed',   30),
  ('at_travel',          'AT Travel',                'Deslocações AT',               'travel',        'rate',    40),
  ('standby_fee',        'Standby Fee',              'Taxa de Standby',              'standby',       'rate',    50),
  ('suspension_fee',     'Suspension Fee',           'Taxa de Suspensão',            'suspension',    'fixed',   60),
  ('procurement_pct',    'Procurement Percentage',   'Procurement por Percentagem',  'procurement',   'percent', 70),
  ('procurement_lump',   'Procurement Lump Sum',     'Procurement por Avença',       'procurement',   'fixed',   80)
ON CONFLICT (code) DO NOTHING;

-- ---- Flags ----
INSERT INTO public.proposal_flags (code, label_en, label_pt, flag_kind, default_value, effects, sort_order) VALUES
  ('public_tender_mode', 'Public Tender Mode', 'Concurso Público', 'boolean', 'false'::jsonb,
    '{"alias_set":"ccp","force_pt_legal":true}'::jsonb, 10),
  ('scope_of_architecture','Scope of Architecture','Âmbito de Arquitetura','boolean','true'::jsonb,
    '{}'::jsonb, 20),
  ('bim_enabled',        'BIM Enabled',        'BIM Ativo',        'boolean', 'false'::jsonb,
    '{"requires_addon":"bim_mgmt"}'::jsonb, 30),
  ('jurisdiction',       'Jurisdiction',       'Jurisdição',       'enum',    '"PT"'::jsonb,
    '{}'::jsonb, 40),
  ('at_retainer_mode',   'AT Retainer Mode',   'Modo de Avença AT','boolean', 'false'::jsonb,
    '{"affects_phase":"P7"}'::jsonb, 50),
  ('umbrella_proposal',  'Umbrella Proposal',  'Proposta Umbrella','boolean', 'false'::jsonb,
    '{}'::jsonb, 60)
ON CONFLICT (code) DO NOTHING;

-- ---- Presets ----
INSERT INTO public.proposal_presets (code, label_en, label_pt, family_code, enabled_phases, default_delivery_mode, default_addons, default_flags, sort_order) VALUES
  ('residential_small',    'Residential — Small',    'Residencial — Pequeno',    'architecture',
    ARRAY['P1','P2','P4','P5','P7','P8'], 'psa_led', ARRAY[]::TEXT[], '{}'::jsonb, 10),
  ('residential_large',    'Residential — Large',    'Residencial — Grande',     'architecture',
    ARRAY['P1','P2','P3','P4','P5','P6','P7','P8','P8_5','P9'], 'psa_led', ARRAY['ffe'], '{"bim_enabled":true}'::jsonb, 20),
  ('workplace_small',      'Workplace — Small',      'Workplace — Pequeno',      'workplace',
    ARRAY['P1','P2','P4','P5','P7','P8','P9'], 'psa_led', ARRAY['ffe'], '{}'::jsonb, 30),
  ('workplace_large',      'Workplace — Large',      'Workplace — Grande',       'workplace',
    ARRAY['P0','P1','P2','P4','P5','P6','P7','P8','P9'], 'psa_led', ARRAY['ffe','signage','av','bim_mgmt'], '{"bim_enabled":true}'::jsonb, 40),
  ('hospitality_shell_core','Hospitality — Shell & Core','Hotelaria — Shell & Core','hospitality',
    ARRAY['P1','P2','P3','P4','P5','P7','P8'], 'psa_led', ARRAY[]::TEXT[], '{}'::jsonb, 50),
  ('hospitality_full',     'Hospitality — Full',     'Hotelaria — Completo',     'hospitality',
    ARRAY['P1','P2','P3','P4','P5','P6','P7','P8','P8_5','P9'], 'psa_led', ARRAY['ffe','signage','lighting','av','kitchens','spa','pool'], '{"bim_enabled":true}'::jsonb, 60),
  ('healthcare_fitout',    'Healthcare — Fit-out',   'Saúde — Fit-out',          'healthcare',
    ARRAY['P1','P2','P4','P5','P7','P8'], 'psa_led', ARRAY['ffe'], '{}'::jsonb, 70),
  ('retainer_standard',    'Retainer — Standard',    'Avença — Standard',        'retainer',
    ARRAY['P7'], 'psa_led', ARRAY[]::TEXT[], '{"at_retainer_mode":true}'::jsonb, 80)
ON CONFLICT (code) DO NOTHING;
