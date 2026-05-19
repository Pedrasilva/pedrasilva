-- Add proposal_number to fee_proposals with auto-numbering "YYNN" format.
-- Year prefix (2-digit) + sequential number within that year.
ALTER TABLE public.fee_proposals
  ADD COLUMN IF NOT EXISTS proposal_number text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_fee_proposals_proposal_number
  ON public.fee_proposals (proposal_number);

-- Sequence counter table keyed by year. One row per year holds the last seq used.
CREATE TABLE IF NOT EXISTS public.fee_proposal_number_counters (
  year_prefix text PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_proposal_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth can read counters" ON public.fee_proposal_number_counters;
CREATE POLICY "Auth can read counters"
  ON public.fee_proposal_number_counters
  FOR SELECT
  TO authenticated
  USING (true);

-- Function: allocate next proposal number for a given date. Returns "YYNN".
CREATE OR REPLACE FUNCTION public.allocate_proposal_number(p_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text;
  v_seq integer;
BEGIN
  v_year := to_char(p_date, 'YY');

  INSERT INTO public.fee_proposal_number_counters (year_prefix, last_seq, updated_at)
  VALUES (v_year, 1, now())
  ON CONFLICT (year_prefix)
  DO UPDATE SET last_seq = public.fee_proposal_number_counters.last_seq + 1,
                updated_at = now()
  RETURNING last_seq INTO v_seq;

  RETURN v_year || lpad(v_seq::text, 2, '0');
END;
$$;

-- Trigger: auto-allocate proposal_number on insert when null.
CREATE OR REPLACE FUNCTION public.fee_proposals_set_proposal_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.proposal_number IS NULL OR NEW.proposal_number = '' THEN
    NEW.proposal_number := public.allocate_proposal_number(
      COALESCE(NEW.data_proposta, CURRENT_DATE)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fee_proposals_set_proposal_number ON public.fee_proposals;
CREATE TRIGGER trg_fee_proposals_set_proposal_number
  BEFORE INSERT ON public.fee_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.fee_proposals_set_proposal_number();

-- Backfill existing rows ordered by created_at so older proposals get lower numbers.
DO $$
DECLARE
  r record;
  v_year text;
  v_seq integer;
BEGIN
  FOR r IN
    SELECT id, COALESCE(data_proposta, created_at::date) AS pdate
    FROM public.fee_proposals
    WHERE proposal_number IS NULL
    ORDER BY created_at ASC
  LOOP
    v_year := to_char(r.pdate, 'YY');
    INSERT INTO public.fee_proposal_number_counters (year_prefix, last_seq, updated_at)
    VALUES (v_year, 1, now())
    ON CONFLICT (year_prefix)
    DO UPDATE SET last_seq = public.fee_proposal_number_counters.last_seq + 1,
                  updated_at = now()
    RETURNING last_seq INTO v_seq;

    UPDATE public.fee_proposals
       SET proposal_number = v_year || lpad(v_seq::text, 2, '0')
     WHERE id = r.id;
  END LOOP;
END $$;