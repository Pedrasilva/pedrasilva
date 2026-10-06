ALTER TYPE public.absence_type ADD VALUE IF NOT EXISTS 'consulta_medica';

CREATE OR REPLACE FUNCTION public.leave_label_for(_tipo text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _tipo
    WHEN 'ferias' THEN 'Vacation'
    WHEN 'casamento' THEN 'Wedding leave'
    WHEN 'falecimento_familiar' THEN 'Bereavement'
    WHEN 'assistencia_filho' THEN 'Child assistance'
    WHEN 'nascimento_filho' THEN 'Parental leave'
    WHEN 'trabalhador_estudante' THEN 'Student worker'
    WHEN 'doacao_sangue' THEN 'Blood donation'
    WHEN 'autorizada_paga' THEN 'Authorized (paid)'
    WHEN 'autorizada_nao_paga' THEN 'Authorized (unpaid)'
    WHEN 'consulta_medica' THEN 'Medical appointment (unpaid)'
    ELSE _tipo END
$$;

ALTER TABLE public.vacation_requests ADD COLUMN IF NOT EXISTS attachment_path text;
COMMENT ON COLUMN public.vacation_requests.attachment_path IS 'Optional proof file in bucket leave-attachments ({collaborator_id}/...); readable only by the person and leave approvers.';

CREATE POLICY "leave attachments read own or approver" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'leave-attachments' AND (
  (storage.foldername(name))[1] = public.get_my_collaborator_id()::text
  OR public.can_approve_leave(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "leave attachments upload own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'leave-attachments' AND (
  (storage.foldername(name))[1] = public.get_my_collaborator_id()::text
  OR public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "leave attachments delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'leave-attachments' AND (storage.foldername(name))[1] = public.get_my_collaborator_id()::text);