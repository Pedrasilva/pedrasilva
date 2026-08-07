ALTER TABLE public.pm_project_contract_baseline_stages
  ADD COLUMN IF NOT EXISTS live_stage_id uuid REFERENCES public.pm_stages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_baseline_stages_live_stage ON public.pm_project_contract_baseline_stages(live_stage_id);