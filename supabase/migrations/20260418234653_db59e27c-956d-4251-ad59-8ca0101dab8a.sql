-- Atualizar definições BO: dias_uteis passa a guardar o valor LÍQUIDO
-- (já com 22 dias de férias descontados), em vez do valor base.
-- Isto é o denominador usado em /resumo, /valor-bo e Pricing para horas produtivas anuais.
-- Para 2026: 252 dias úteis − 22 dias férias = 230 dias.
UPDATE public.bo_settings
SET dias_uteis = GREATEST(0, dias_uteis - 22),
    updated_at = now()
WHERE dias_uteis > 22;

-- Mudar o default da coluna para reflectir o novo significado
ALTER TABLE public.bo_settings ALTER COLUMN dias_uteis SET DEFAULT 230;