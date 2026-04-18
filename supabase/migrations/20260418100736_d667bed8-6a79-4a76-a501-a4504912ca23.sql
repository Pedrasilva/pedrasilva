INSERT INTO public.holidays (data, nome, tipo) VALUES
  ('2025-06-13', 'Santo António (Lisboa)', 'municipal_lisboa'),
  ('2026-06-13', 'Santo António (Lisboa)', 'municipal_lisboa')
ON CONFLICT (data) DO NOTHING;