-- lovable-cron-fallback-reviewed: Gmail push (Pub/Sub) is unavailable through the connector; user requires a 10-minute label poll.
CREATE TABLE IF NOT EXISTS public.crm_email_lead_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'lead' CHECK (kind IN ('lead','reply')),
  mailbox text NOT NULL,
  thread_id text NOT NULL,
  gmail_message_ids text[] NOT NULL DEFAULT '{}',
  subject text,
  from_address text,
  received_at timestamptz,
  email_text text,
  attachment_names text[] NOT NULL DEFAULT '{}',
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  matched_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  matched_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  matched_opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  match_reason text,
  suggested_next_action text,
  suggested_next_action_date date,
  owner_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','discarded')),
  decided_by uuid,
  decided_at timestamptz,
  result_opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  result_activity_id uuid,
  model_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_email_lead_drafts_status_idx ON public.crm_email_lead_drafts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_email_lead_drafts_thread_idx ON public.crm_email_lead_drafts(thread_id);

CREATE TABLE IF NOT EXISTS public.crm_email_threads (
  mailbox text NOT NULL,
  thread_id text NOT NULL,
  processed_message_ids text[] NOT NULL DEFAULT '{}',
  first_draft_id uuid REFERENCES public.crm_email_lead_drafts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mailbox, thread_id)
);

CREATE TABLE IF NOT EXISTS public.crm_email_intake_gate (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
INSERT INTO public.crm_email_intake_gate(id) VALUES (1) ON CONFLICT DO NOTHING;
REVOKE ALL ON public.crm_email_intake_gate FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crm_email_intake_gate TO service_role;
ALTER TABLE public.crm_email_intake_gate ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.crm_email_lead_drafts TO authenticated;
GRANT ALL ON public.crm_email_lead_drafts TO service_role;
GRANT ALL ON public.crm_email_threads TO service_role;

ALTER TABLE public.crm_email_lead_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM read email lead drafts" ON public.crm_email_lead_drafts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_permission(auth.uid(), 'crm.pipeline') OR has_permission(auth.uid(), 'finance.dashboard'));
CREATE POLICY "Admins edit pending email lead drafts" ON public.crm_email_lead_drafts
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND status = 'pending')
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND status = 'pending');

CREATE OR REPLACE FUNCTION public.crm_email_lead_discard(p_draft uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE crm_email_lead_drafts SET status='discarded', decided_by=auth.uid(), decided_at=now(), updated_at=now()
   WHERE id=p_draft AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'draft not pending'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.crm_email_lead_confirm(p_draft uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d crm_email_lead_drafts%ROWTYPE;
  x jsonb;
  v_company uuid; v_contact uuid; v_opp uuid; v_act uuid;
  v_first text; v_last text; v_name text; v_resumo text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO d FROM crm_email_lead_drafts WHERE id=p_draft FOR UPDATE;
  IF NOT FOUND OR d.status <> 'pending' THEN RAISE EXCEPTION 'draft not pending'; END IF;
  x := d.extracted;

  v_company := d.matched_company_id;
  IF v_company IS NULL AND nullif(trim(x->>'company'),'') IS NOT NULL THEN
    INSERT INTO companies(nome) VALUES (trim(x->>'company')) RETURNING id INTO v_company;
  END IF;

  v_contact := d.matched_contact_id;
  v_name := nullif(trim(x->>'contact_name'),'');
  IF v_contact IS NULL AND (v_name IS NOT NULL OR nullif(trim(x->>'email'),'') IS NOT NULL) THEN
    v_first := nullif(split_part(coalesce(v_name,''),' ',1),'');
    v_last := nullif(trim(substr(coalesce(v_name,''), length(coalesce(v_first,''))+1)),'');
    INSERT INTO contacts(primeiro_nome, apelido, email, telefone, posicao, company_id)
    VALUES (coalesce(v_first, split_part(x->>'email','@',1)), v_last,
            nullif(lower(trim(x->>'email')),''), nullif(trim(x->>'phone'),''), nullif(trim(x->>'role'),''), v_company)
    RETURNING id INTO v_contact;
  ELSIF v_contact IS NOT NULL THEN
    UPDATE contacts SET
      telefone = coalesce(telefone, nullif(trim(x->>'phone'),'')),
      posicao  = coalesce(posicao, nullif(trim(x->>'role'),'')),
      company_id = coalesce(company_id, v_company),
      updated_at = now()
    WHERE id = v_contact;
  END IF;

  v_resumo := left(coalesce(nullif(d.summary,''), d.subject, 'Email'), 300);

  IF d.matched_opportunity_id IS NOT NULL THEN
    v_opp := d.matched_opportunity_id;
    UPDATE crm_opportunities SET
      next_action = coalesce(d.suggested_next_action, next_action),
      next_action_date = coalesce(d.suggested_next_action_date, next_action_date),
      last_activity_at = now(), updated_at = now()
    WHERE id = v_opp;
  ELSE
    INSERT INTO crm_opportunities(name, company_id, primary_contact_id, stage, source,
      contact_name, contact_email, contact_phone, project_brief,
      next_action, next_action_date, next_action_owner_id, created_by, last_activity_at)
    VALUES (
      left(coalesce(nullif(trim(x->>'project_type'),'') || coalesce(' — ' || nullif(trim(x->>'location'),''),''),
                    nullif(trim(x->>'company'),''), v_name, d.subject, 'Lead por email'), 200),
      v_company, v_contact, 'lead', 'email',
      v_name, nullif(lower(trim(x->>'email')),''), nullif(trim(x->>'phone'),''), d.summary,
      d.suggested_next_action, d.suggested_next_action_date, coalesce(d.owner_id, auth.uid()), auth.uid(), now())
    RETURNING id INTO v_opp;
  END IF;

  INSERT INTO crm_activities(tipo, resumo, detalhes, data_actividade, company_id, contact_id, created_by)
  VALUES ('email', v_resumo, d.email_text, coalesce(d.received_at, now()), v_company, v_contact, auth.uid())
  RETURNING id INTO v_act;

  INSERT INTO opportunity_activities(opportunity_id, type, content, created_by)
  VALUES (v_opp, 'email', v_resumo, auth.uid());

  UPDATE crm_email_lead_drafts SET status='confirmed', decided_by=auth.uid(), decided_at=now(),
    result_opportunity_id=v_opp, result_activity_id=v_act,
    matched_company_id=v_company, matched_contact_id=v_contact, updated_at=now()
  WHERE id=p_draft;

  UPDATE crm_email_lead_drafts SET matched_opportunity_id = v_opp,
    matched_contact_id = coalesce(matched_contact_id, v_contact),
    matched_company_id = coalesce(matched_company_id, v_company)
  WHERE thread_id = d.thread_id AND status='pending' AND matched_opportunity_id IS NULL;
  RETURN v_opp;
END $$;

REVOKE EXECUTE ON FUNCTION public.crm_email_lead_confirm(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.crm_email_lead_discard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_email_lead_confirm(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_email_lead_discard(uuid) TO authenticated;

SELECT cron.schedule(
  'crm-email-intake-every-10-min',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--945f60ba-be65-42ad-a5a3-dc640ed8b1b3.lovable.app/api/public/hooks/crm-email-intake',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-intake-secret', (SELECT token FROM public.crm_email_intake_gate WHERE id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);