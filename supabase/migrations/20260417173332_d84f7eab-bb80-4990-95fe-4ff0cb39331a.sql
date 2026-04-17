CREATE TABLE public.bo_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  custos_operacionais_anual numeric NOT NULL DEFAULT 0,
  dias_uteis integer NOT NULL DEFAULT 220,
  horas_dia numeric NOT NULL DEFAULT 8,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bo_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read bo_settings" ON public.bo_settings FOR SELECT USING (true);
CREATE POLICY "public write bo_settings" ON public.bo_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "public update bo_settings" ON public.bo_settings FOR UPDATE USING (true);

CREATE TRIGGER update_bo_settings_updated_at
BEFORE UPDATE ON public.bo_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.bo_settings (singleton, custos_operacionais_anual, dias_uteis, horas_dia)
VALUES (true, 0, 220, 8);