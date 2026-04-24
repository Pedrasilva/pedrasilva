-- Add columns to quote_payment_schedule_items to support generators with manual override tracking.
ALTER TABLE public.quote_payment_schedule_items
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generator_source text;

COMMENT ON COLUMN public.quote_payment_schedule_items.manual_override IS
  'True when the user has hand-edited this item — generators must not overwrite or delete it.';
COMMENT ON COLUMN public.quote_payment_schedule_items.generator_source IS
  'Identifier of the generator that produced this row (e.g. ''milestones'', ''thirds'', ''monthly''). NULL for manually-created rows.';

CREATE INDEX IF NOT EXISTS quote_payment_schedule_items_quote_idx
  ON public.quote_payment_schedule_items(quote_id, sort_order);