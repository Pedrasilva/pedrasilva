-- 1. New classification: personal expenses covered by the company
INSERT INTO public.financial_classifications (code, name_pt, name_en, level, parent_id, active, financial_nature, spending_policy)
SELECT 'BEN.PERS', 'Despesas pessoais', 'Personal expenses', 'category',
       (SELECT id FROM public.financial_classifications WHERE code = 'BEN'), true, 'payroll', 'discretionary'
WHERE NOT EXISTS (SELECT 1 FROM public.financial_classifications WHERE code = 'BEN.PERS');

-- 2. Staff assignment on the review queue
ALTER TABLE public.financial_document_review_queue
  ADD COLUMN IF NOT EXISTS assigned_collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fdrq_assigned_collaborator
  ON public.financial_document_review_queue(assigned_collaborator_id)
  WHERE assigned_collaborator_id IS NOT NULL;

-- 3. Benefit expenses: finance code, origin document, reconciliation link
ALTER TABLE public.benefit_expenses
  ADD COLUMN IF NOT EXISTS classification_id uuid REFERENCES public.financial_classifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financial_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'hr';

DO $$ BEGIN
  ALTER TABLE public.benefit_expenses
    ADD CONSTRAINT benefit_expenses_origin_check CHECK (origin IN ('hr','finance'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_benefit_expenses_classification ON public.benefit_expenses(classification_id);
CREATE INDEX IF NOT EXISTS idx_benefit_expenses_financial_document ON public.benefit_expenses(financial_document_id);
CREATE INDEX IF NOT EXISTS idx_benefit_expenses_bank_tx ON public.benefit_expenses(bank_transaction_id);

-- 4. Map HR benefit categories onto the finance codes
ALTER TABLE public.benefit_categories
  ADD COLUMN IF NOT EXISTS classification_id uuid REFERENCES public.financial_classifications(id) ON DELETE SET NULL;

UPDATE public.benefit_categories bc
SET classification_id = fc.id
FROM public.financial_classifications fc
WHERE fc.code = CASE bc.code
    WHEN 'meals' THEN 'BEN.FOOD'
    WHEN 'wellness' THEN 'BEN.HEALTH'
    ELSE 'BEN.OTHER'
  END
  AND bc.classification_id IS DISTINCT FROM fc.id;

INSERT INTO public.benefit_categories (code, label_pt, label_en, icon, sort_order, active, classification_id)
SELECT 'personal_expenses', 'Despesas pessoais', 'Personal expenses', 'wallet', 95, true,
       (SELECT id FROM public.financial_classifications WHERE code = 'BEN.PERS')
WHERE NOT EXISTS (SELECT 1 FROM public.benefit_categories WHERE code = 'personal_expenses');

-- 5. Backfill classification_id on existing benefit expenses from their category
UPDATE public.benefit_expenses be
SET classification_id = bc.classification_id
FROM public.benefit_categories bc
WHERE be.category_id = bc.id AND be.classification_id IS NULL;