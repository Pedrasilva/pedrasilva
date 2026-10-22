CREATE TABLE public.marketing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  meta_page_id text,
  meta_page_name text,
  instagram_account_id text,
  instagram_username text,
  connected_at timestamptz,
  last_tested_at timestamptz NOT NULL DEFAULT now(),
  granted_permissions text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz,
  data_access_expires_at timestamptz,
  token_never_expires boolean NOT NULL DEFAULT false,
  token_valid boolean,
  connection_ok boolean NOT NULL DEFAULT false,
  last_error_code text,
  graph_api_version text NOT NULL DEFAULT 'v26.0'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_settings TO authenticated;
GRANT ALL ON public.marketing_settings TO service_role;
REVOKE ALL ON public.marketing_settings FROM anon;
REVOKE TRUNCATE ON public.marketing_settings FROM anon, authenticated;
ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_settings_read ON public.marketing_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR (public.is_psa_staff() AND public.has_module_permission(auth.uid(), 'marketing.view', 'own')));
CREATE POLICY marketing_settings_insert_admin ON public.marketing_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY marketing_settings_update_admin ON public.marketing_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY marketing_settings_delete_admin ON public.marketing_settings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
COMMENT ON TABLE public.marketing_settings IS 'Non-secret Meta connection metadata only. Access tokens must never be stored here.';