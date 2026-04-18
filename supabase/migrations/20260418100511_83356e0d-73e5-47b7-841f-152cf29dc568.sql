-- Tabela de feriados nacionais
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nacional',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read holidays"
  ON public.holidays FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert holidays"
  ON public.holidays FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update holidays"
  ON public.holidays FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete holidays"
  ON public.holidays FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_holidays_data ON public.holidays(data);

-- Pré-carregar feriados nacionais PT 2025 e 2026
INSERT INTO public.holidays (data, nome) VALUES
  -- 2025
  ('2025-01-01', 'Ano Novo'),
  ('2025-04-18', 'Sexta-feira Santa'),
  ('2025-04-20', 'Páscoa'),
  ('2025-04-25', 'Dia da Liberdade'),
  ('2025-05-01', 'Dia do Trabalhador'),
  ('2025-06-10', 'Dia de Portugal'),
  ('2025-06-19', 'Corpo de Deus'),
  ('2025-08-15', 'Assunção de Nossa Senhora'),
  ('2025-10-05', 'Implantação da República'),
  ('2025-11-01', 'Todos os Santos'),
  ('2025-12-01', 'Restauração da Independência'),
  ('2025-12-08', 'Imaculada Conceição'),
  ('2025-12-25', 'Natal'),
  -- 2026
  ('2026-01-01', 'Ano Novo'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-05', 'Páscoa'),
  ('2026-04-25', 'Dia da Liberdade'),
  ('2026-05-01', 'Dia do Trabalhador'),
  ('2026-06-04', 'Corpo de Deus'),
  ('2026-06-10', 'Dia de Portugal'),
  ('2026-08-15', 'Assunção de Nossa Senhora'),
  ('2026-10-05', 'Implantação da República'),
  ('2026-11-01', 'Todos os Santos'),
  ('2026-12-01', 'Restauração da Independência'),
  ('2026-12-08', 'Imaculada Conceição'),
  ('2026-12-25', 'Natal');
