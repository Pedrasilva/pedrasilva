
-- ============================================================
-- Milestone 2 — Ontology wiring (additive nullable columns)
-- ============================================================

-- fee_proposals: link to ontology family/preset/delivery + flags bag
ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS ontology_family_code   TEXT,
  ADD COLUMN IF NOT EXISTS ontology_preset_code   TEXT,
  ADD COLUMN IF NOT EXISTS ontology_delivery_mode TEXT,
  ADD COLUMN IF NOT EXISTS ontology_flags         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ontology_bootstrapped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ontology_metadata      JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Soft FKs to registry tables (nullable, no cascade — registries are stable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_proposals_ontology_family_fk'
  ) THEN
    ALTER TABLE public.fee_proposals
      ADD CONSTRAINT fee_proposals_ontology_family_fk
      FOREIGN KEY (ontology_family_code)
      REFERENCES public.proposal_families(code) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_proposals_ontology_preset_fk'
  ) THEN
    ALTER TABLE public.fee_proposals
      ADD CONSTRAINT fee_proposals_ontology_preset_fk
      FOREIGN KEY (ontology_preset_code)
      REFERENCES public.proposal_presets(code) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_proposals_ontology_delivery_fk'
  ) THEN
    ALTER TABLE public.fee_proposals
      ADD CONSTRAINT fee_proposals_ontology_delivery_fk
      FOREIGN KEY (ontology_delivery_mode)
      REFERENCES public.proposal_delivery_modes(code) ON DELETE SET NULL;
  END IF;
END $$;

-- quote_stages: link to canonical phase / add-on + generated/manual flags
ALTER TABLE public.quote_stages
  ADD COLUMN IF NOT EXISTS phase_code        TEXT,
  ADD COLUMN IF NOT EXISTS addon_module_code TEXT,
  ADD COLUMN IF NOT EXISTS is_generated      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_override   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generator_source  TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_stages_phase_code_fk'
  ) THEN
    ALTER TABLE public.quote_stages
      ADD CONSTRAINT quote_stages_phase_code_fk
      FOREIGN KEY (phase_code)
      REFERENCES public.proposal_phases(code) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_stages_addon_module_fk'
  ) THEN
    ALTER TABLE public.quote_stages
      ADD CONSTRAINT quote_stages_addon_module_fk
      FOREIGN KEY (addon_module_code)
      REFERENCES public.proposal_addon_modules(code) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quote_stages_phase_code ON public.quote_stages(phase_code);

-- quote_stage_dependencies: generated/manual flags
ALTER TABLE public.quote_stage_dependencies
  ADD COLUMN IF NOT EXISTS is_generated     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_override  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generator_source TEXT;
