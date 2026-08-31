ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS mark_for_inventory boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.inventory_line_skips (
  line_id uuid PRIMARY KEY REFERENCES public.financial_document_lines(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.financial_documents(id) ON DELETE CASCADE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_line_skips_document ON public.inventory_line_skips(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_line_skips TO authenticated;
GRANT ALL ON public.inventory_line_skips TO service_role;

ALTER TABLE public.inventory_line_skips ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='inventory_line_skips' AND policyname='Authenticated can read inventory line skips') THEN
    CREATE POLICY "Authenticated can read inventory line skips"
      ON public.inventory_line_skips FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='inventory_line_skips' AND policyname='Authenticated can manage inventory line skips') THEN
    CREATE POLICY "Authenticated can manage inventory line skips"
      ON public.inventory_line_skips FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;