INSERT INTO public.email_rules (category, auto_action, requires_review)
VALUES
  ('new_enquiry', 'reply', true),
  ('project_correspondence', 'reply', true),
  ('supplier_invoice', 'label_only', true),
  ('admin_finance', 'label_only', true),
  ('recruitment', 'archive', true),
  ('newsletter_marketing', 'archive', true)
ON CONFLICT (category) DO NOTHING;