ALTER TABLE public.salary_snapshots
ADD COLUMN IF NOT EXISTS passe_anual numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.salary_snapshots.passe_anual IS
'Annual public-transport pass cost (employer-paid benefit). Treated as a separate annual allowance, included in total HR cost (custoVBG) but not in the employee net.';