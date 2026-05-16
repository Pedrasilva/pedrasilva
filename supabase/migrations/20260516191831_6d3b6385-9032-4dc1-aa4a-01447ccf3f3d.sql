DROP VIEW IF EXISTS public.benefit_expenses_v;

CREATE VIEW public.benefit_expenses_v
WITH (security_invoker = true) AS
SELECT
  e.*,
  COALESCE(c.code, lc.code) AS category_code,
  COALESCE(c.label_pt, lc.label_pt) AS category_label_pt,
  COALESCE(c.label_en, lc.label_en) AS category_label_en
FROM public.benefit_expenses e
LEFT JOIN public.benefit_categories c ON c.id = e.category_id
LEFT JOIN public.benefit_category_legacy_aliases la ON la.legacy_enum = e.categoria
LEFT JOIN public.benefit_categories lc ON lc.id = la.category_id;