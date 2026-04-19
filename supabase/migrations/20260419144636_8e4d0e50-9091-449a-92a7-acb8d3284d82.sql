CREATE TABLE public.meal_allowance_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ano INTEGER NOT NULL UNIQUE,
  valor_cartao NUMERIC NOT NULL DEFAULT 0,
  valor_dinheiro NUMERIC NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_allowance_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read meal_allowance_rates"
ON public.meal_allowance_rates FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins insert meal_allowance_rates"
ON public.meal_allowance_rates FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update meal_allowance_rates"
ON public.meal_allowance_rates FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete meal_allowance_rates"
ON public.meal_allowance_rates FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_meal_allowance_rates_updated_at
BEFORE UPDATE ON public.meal_allowance_rates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.meal_allowance_rates (ano, valor_cartao, valor_dinheiro) VALUES
  (2022, 8.32, 0),
  (2023, 9.60, 0),
  (2024, 10.20, 0),
  (2025, 10.20, 0),
  (2026, 10.46, 0);