-- Trigger function: when a quote's status changes, sync the linked
-- opportunity's pipeline stage. Only ever advances forward; never overrides
-- a manual "negotiation" stage while the quote is still draft/sent.
CREATE OR REPLACE FUNCTION public.sync_opportunity_stage_from_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp_id uuid;
  v_current_stage crm_opportunity_stage;
  v_has_approved boolean;
  v_has_active boolean; -- draft or sent
  v_total integer;
BEGIN
  v_opp_id := COALESCE(NEW.opportunity_id, OLD.opportunity_id);
  IF v_opp_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT stage INTO v_current_stage
  FROM public.crm_opportunities WHERE id = v_opp_id;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Aggregate this opportunity's quotes after the change.
  SELECT
    COUNT(*),
    bool_or(quote_status = 'approved'),
    bool_or(quote_status IN ('draft', 'sent'))
    INTO v_total, v_has_approved, v_has_active
  FROM public.fee_proposals
  WHERE opportunity_id = v_opp_id;

  IF v_total = 0 THEN
    -- No quotes left: drop back to lead unless someone manually set won/lost.
    IF v_current_stage NOT IN ('won', 'lost') THEN
      UPDATE public.crm_opportunities
        SET stage = 'lead', updated_at = now()
        WHERE id = v_opp_id;
    END IF;
  ELSIF v_has_approved THEN
    IF v_current_stage <> 'won' THEN
      UPDATE public.crm_opportunities
        SET stage = 'won', updated_at = now()
        WHERE id = v_opp_id;
    END IF;
  ELSIF v_has_active THEN
    -- Promote leads to proposal. Leave 'negotiation' alone.
    IF v_current_stage = 'lead' THEN
      UPDATE public.crm_opportunities
        SET stage = 'proposal', updated_at = now()
        WHERE id = v_opp_id;
    END IF;
  ELSE
    -- All quotes are rejected: mark opportunity lost (unless already won).
    IF v_current_stage <> 'won' AND v_current_stage <> 'lost' THEN
      UPDATE public.crm_opportunities
        SET stage = 'lost', updated_at = now()
        WHERE id = v_opp_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_opp_stage_from_quote_trg ON public.fee_proposals;
CREATE TRIGGER sync_opp_stage_from_quote_trg
AFTER INSERT OR UPDATE OF quote_status, opportunity_id OR DELETE
ON public.fee_proposals
FOR EACH ROW
EXECUTE FUNCTION public.sync_opportunity_stage_from_quote();

-- Backfill existing opportunities based on their current quotes.
WITH agg AS (
  SELECT
    o.id AS opp_id,
    o.stage AS current_stage,
    COUNT(p.id) AS total_quotes,
    bool_or(p.quote_status = 'approved') AS has_approved,
    bool_or(p.quote_status IN ('draft', 'sent')) AS has_active
  FROM public.crm_opportunities o
  LEFT JOIN public.fee_proposals p ON p.opportunity_id = o.id
  GROUP BY o.id, o.stage
)
UPDATE public.crm_opportunities o
SET stage = CASE
  WHEN agg.has_approved THEN 'won'::crm_opportunity_stage
  WHEN agg.total_quotes = 0 THEN
    CASE WHEN o.stage IN ('won','lost') THEN o.stage ELSE 'lead'::crm_opportunity_stage END
  WHEN agg.has_active THEN
    CASE WHEN o.stage = 'lead' THEN 'proposal'::crm_opportunity_stage ELSE o.stage END
  ELSE
    CASE WHEN o.stage IN ('won','lost') THEN o.stage ELSE 'lost'::crm_opportunity_stage END
END,
updated_at = now()
FROM agg
WHERE o.id = agg.opp_id
  AND o.stage IS DISTINCT FROM (CASE
    WHEN agg.has_approved THEN 'won'::crm_opportunity_stage
    WHEN agg.total_quotes = 0 THEN
      CASE WHEN o.stage IN ('won','lost') THEN o.stage ELSE 'lead'::crm_opportunity_stage END
    WHEN agg.has_active THEN
      CASE WHEN o.stage = 'lead' THEN 'proposal'::crm_opportunity_stage ELSE o.stage END
    ELSE
      CASE WHEN o.stage IN ('won','lost') THEN o.stage ELSE 'lost'::crm_opportunity_stage END
  END);