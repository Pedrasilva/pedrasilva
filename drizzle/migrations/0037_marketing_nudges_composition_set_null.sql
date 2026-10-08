ALTER TABLE public.marketing_nudges DROP CONSTRAINT IF EXISTS marketing_nudges_composition_id_fkey;
ALTER TABLE public.marketing_nudges ADD CONSTRAINT marketing_nudges_composition_id_fkey
  FOREIGN KEY (composition_id) REFERENCES public.marketing_compositions(id) ON DELETE SET NULL;