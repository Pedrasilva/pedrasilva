CREATE TYPE public.email_rule_match AS ENUM ('exact_address','domain');
CREATE TYPE public.email_rule_action AS ENUM ('archive','label_only','trash');

CREATE TABLE public.email_sender_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type public.email_rule_match NOT NULL DEFAULT 'exact_address',
  sender_pattern text NOT NULL,
  category text NOT NULL,
  action public.email_rule_action NOT NULL DEFAULT 'label_only',
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX email_sender_rules_pattern_uniq
  ON public.email_sender_rules (match_type, lower(sender_pattern));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sender_rules TO authenticated;
GRANT ALL ON public.email_sender_rules TO service_role;

ALTER TABLE public.email_sender_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_sender_rules_staff_read" ON public.email_sender_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "email_sender_rules_admin_write" ON public.email_sender_rules
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER email_sender_rules_touch
  BEFORE UPDATE ON public.email_sender_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.email_events
  ADD COLUMN classification_source text NOT NULL DEFAULT 'ai';