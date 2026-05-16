ALTER TABLE public.collaborators
  ADD COLUMN target_chargeability_pct numeric NULL;

ALTER TABLE public.collaborators
  ADD CONSTRAINT collaborators_target_chargeability_pct_chk
  CHECK (
    target_chargeability_pct IS NULL
    OR (target_chargeability_pct >= 0 AND target_chargeability_pct <= 100)
  );

COMMENT ON COLUMN public.collaborators.target_chargeability_pct IS
  'Observational HR field (Phase 0). Expected percentage of weekly capacity recoverable through project work. NULL = not defined. Does NOT influence pricing, cost rates, BO distribution, planner overload, or any financial calculation. Read-only display in HR UI only.';