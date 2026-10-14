ALTER TYPE public.absence_type ADD VALUE IF NOT EXISTS 'baixa_medica';

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
    WHEN 'baixa_medica' THEN 'Certified sick leave'
    ELSE _tipo END
$$;

ALTER TABLE public.vacation_requests DROP CONSTRAINT IF EXISTS chk_baixa_medica_requires_attachment;
ALTER TABLE public.vacation_requests ADD CONSTRAINT chk_baixa_medica_requires_attachment
  CHECK (tipo::text <> 'baixa_medica' OR attachment_path IS NOT NULL);