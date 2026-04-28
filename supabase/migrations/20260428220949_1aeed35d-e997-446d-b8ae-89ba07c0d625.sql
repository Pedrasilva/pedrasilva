-- Add 'income' to financial_nature enum
ALTER TYPE financial_nature ADD VALUE IF NOT EXISTS 'income';

-- Deprecate existing starter rows (keep for historical reference)
UPDATE financial_classifications
SET active = false,
    code = 'legacy.' || code,
    notes = COALESCE(notes || E'\n', '') || 'Deprecated 2026-04-28 — replaced by Orçamento 2026 grid.'
WHERE code NOT LIKE 'legacy.%'
  AND code NOT LIKE 'OPS%' AND code NOT LIKE 'PRD%'
  AND code NOT LIKE 'HR%'  AND code NOT LIKE 'TAX%'
  AND code NOT LIKE 'BEN%' AND code NOT LIKE 'REIM%'
  AND code NOT LIKE 'INC%' AND code NOT LIKE 'TRF%';