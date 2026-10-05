CREATE TABLE public.finance_intake_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  finance_address text NOT NULL DEFAULT 'docs@pedrasilva.com',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.finance_intake_settings TO authenticated;
GRANT ALL ON public.finance_intake_settings TO service_role;
ALTER TABLE public.finance_intake_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users read intake settings" ON public.finance_intake_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'finance.dashboard'));
CREATE POLICY "Admins manage intake settings" ON public.finance_intake_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.finance_intake_settings (id) VALUES (true);

CREATE TABLE public.finance_sender_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL UNIQUE CHECK (pattern = lower(btrim(pattern)) AND pattern <> ''),
  action text NOT NULL CHECK (action IN ('ignore','process')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_sender_rules TO authenticated;
GRANT ALL ON public.finance_sender_rules TO service_role;
ALTER TABLE public.finance_sender_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users read sender rules" ON public.finance_sender_rules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'finance.dashboard'));
CREATE POLICY "Admins manage sender rules" ON public.finance_sender_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));