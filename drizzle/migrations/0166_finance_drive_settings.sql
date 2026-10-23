CREATE TABLE public.finance_drive_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  shared_drive_id text,
  intake_folder_id text,
  processed_folder_id text,
  failed_folder_id text,
  contabilidade_root_id text,
  last_test jsonb,
  last_test_at timestamptz,
  last_test_ok boolean,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.finance_drive_settings TO authenticated;
GRANT ALL ON public.finance_drive_settings TO service_role;
REVOKE TRUNCATE ON public.finance_drive_settings FROM anon, authenticated;
ALTER TABLE public.finance_drive_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read drive settings" ON public.finance_drive_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert drive settings" ON public.finance_drive_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update drive settings" ON public.finance_drive_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));