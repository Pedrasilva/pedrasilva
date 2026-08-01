CREATE TABLE public.financial_email_processed_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  thread_id text,
  from_address text,
  subject text,
  received_at timestamptz,
  attachments_queued integer NOT NULL DEFAULT 0,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_email_processed_messages TO authenticated;
GRANT ALL ON public.financial_email_processed_messages TO service_role;
ALTER TABLE public.financial_email_processed_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance users can read processed email messages"
ON public.financial_email_processed_messages FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'finance.dashboard'));