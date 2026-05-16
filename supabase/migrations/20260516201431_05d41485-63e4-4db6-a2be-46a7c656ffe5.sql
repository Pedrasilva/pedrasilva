-- Phase 2a: HR Benefits ↔ Finance link plumbing only (no behaviour change)

-- 1. Backlink columns on financial_expense_items
ALTER TABLE public.financial_expense_items
  ADD COLUMN IF NOT EXISTS source_ref_table text,
  ADD COLUMN IF NOT EXISTS source_ref_id    uuid;

COMMENT ON COLUMN public.financial_expense_items.source_ref_table IS
  'Optional backlink: name of the table that originated this finance row (e.g. ''benefit_expenses''). Phase 2a plumbing.';
COMMENT ON COLUMN public.financial_expense_items.source_ref_id IS
  'Optional backlink: id of the source row in source_ref_table.';

-- Prevent duplicate finance rows for the same HR benefit expense
CREATE UNIQUE INDEX IF NOT EXISTS uq_fei_benefit_source
  ON public.financial_expense_items (source_ref_id)
  WHERE source_ref_table = 'benefit_expenses';

CREATE INDEX IF NOT EXISTS idx_fei_source_ref
  ON public.financial_expense_items (source_ref_table, source_ref_id)
  WHERE source_ref_table IS NOT NULL;

-- 2. Idempotent synthetic supplier for collaborator reimbursements
INSERT INTO public.companies (nome, is_supplier, is_client, is_active, notas, company_type)
SELECT
  'Reembolsos a Colaboradores',
  true,
  false,
  true,
  'Fornecedor sintético interno para reembolsos de despesas de benefícios HR. Não corresponde a uma entidade legal real — não editar/eliminar.',
  'internal'
WHERE NOT EXISTS (
  SELECT 1 FROM public.companies
   WHERE nome = 'Reembolsos a Colaboradores'
     AND is_supplier = true
);

-- 3. Extend benefit_expenses_v with read-only finance link fields
CREATE OR REPLACE VIEW public.benefit_expenses_v AS
SELECT
  e.id,
  e.collaborator_id,
  e.ano_fiscal,
  e.categoria,
  e.descricao,
  e.valor,
  e.data_despesa,
  e.foto_path,
  e.estado,
  e.notas_colaborador,
  e.notas_aprovacao,
  e.aprovado_por,
  e.aprovado_em,
  e.pago_em,
  e.created_at,
  e.updated_at,
  e.category_id,
  e.pago_por,
  COALESCE(c.code, lc.code)         AS category_code,
  COALESCE(c.label_pt, lc.label_pt) AS category_label_pt,
  COALESCE(c.label_en, lc.label_en) AS category_label_en,
  -- Phase 2a: read-only finance backlink (NULL until Phase 2b write-through)
  fei.id        AS finance_item_id,
  fei.status    AS finance_status,
  fei.due_date  AS finance_due_date,
  fei.paid_date AS finance_paid_date,
  fei.period_id AS finance_period_id
FROM public.benefit_expenses e
LEFT JOIN public.benefit_categories c
  ON c.id = e.category_id
LEFT JOIN public.benefit_category_legacy_aliases la
  ON la.legacy_enum = e.categoria
LEFT JOIN public.benefit_categories lc
  ON lc.id = la.category_id
LEFT JOIN public.financial_expense_items fei
  ON fei.source_ref_table = 'benefit_expenses'
 AND fei.source_ref_id    = e.id;

COMMENT ON VIEW public.benefit_expenses_v IS
  'Benefit expenses with category labels + (Phase 2a) optional finance backlink fields. Underlying RLS on benefit_expenses still governs row visibility.';