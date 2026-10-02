ALTER TABLE public.marketing_captures DROP CONSTRAINT IF EXISTS marketing_captures_format_hint_check;
ALTER TABLE public.marketing_captures ADD CONSTRAINT marketing_captures_format_hint_check CHECK (format_hint IN ('auto','single','carousel','story'));
CREATE OR REPLACE FUNCTION public.marketing_set_capture_format(_capture_id uuid, _format_hint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.marketing_can_arrange_capture(_capture_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _format_hint NOT IN ('auto','single','carousel','story') THEN RAISE EXCEPTION 'Invalid format'; END IF;
  UPDATE public.marketing_captures SET format_hint = _format_hint WHERE id = _capture_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_set_capture_format(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketing_set_capture_format(uuid, text) TO authenticated;