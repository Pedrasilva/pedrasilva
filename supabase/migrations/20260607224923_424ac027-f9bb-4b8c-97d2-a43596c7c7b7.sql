
DO $$
DECLARE v_tpl uuid;
BEGIN
  INSERT INTO public.quote_templates(name, description, category, project_type, is_active)
  VALUES (
    'Healthcare — Master Template V1 (PT)',
    'Modelo editorial aprovado para propostas de arquitetura na área da saúde. Inclui fases fixas P1–P3 + Assistência Técnica mensal. Fases opcionais (Viabilidade, Licenciamento, Mobiliário, Sinalética) devem ser adicionadas manualmente quando aplicáveis.',
    'project'::crm_quote_category,
    'generic',
    true
  ) RETURNING id INTO v_tpl;

  INSERT INTO public.quote_template_stages(template_id, stage_temp_key, sort_order, title, duration_days, fee_percentage, color, billing_trigger_default) VALUES
    (v_tpl, 'p1_programa_base', 0, 'Programa Base',         30,  20, '#0ea5e9', 'stage_end'),
    (v_tpl, 'p2_estudo_previo', 1, 'Estudo Prévio',         45,  30, '#22c55e', 'stage_end'),
    (v_tpl, 'p3_execucao',      2, 'Projeto de Execução',   60,  50, '#f59e0b', 'stage_end'),
    (v_tpl, 'p7_assistencia',   3, 'Assistência Técnica',  180,   0, '#a855f7', 'monthly');

  INSERT INTO public.quote_template_payment_rules(template_id, stage_temp_key, sort_order, label, trigger_type, amount_type, amount_value, payment_terms_days) VALUES
    (v_tpl, NULL,               0, 'Adjudicação',                       'project_start', 'percent', 20, 30),
    (v_tpl, 'p1_programa_base', 1, 'Entrega Programa Base',             'stage_end',     'percent', 20, 30),
    (v_tpl, 'p2_estudo_previo', 2, 'Entrega Estudo Prévio',             'stage_end',     'percent', 30, 30),
    (v_tpl, 'p3_execucao',      3, 'Entrega Projeto de Execução',       'stage_end',     'percent', 30, 30),
    (v_tpl, 'p7_assistencia',   4, 'Assistência Técnica (mensal)',      'monthly',       'fixed',    0, 30);

  INSERT INTO public.quote_template_blocks(template_id, block_title, sort_order, required) VALUES
    (v_tpl, 'Capa',                                 0,  true),
    (v_tpl, 'Índice',                               1,  true),
    (v_tpl, 'Descrição do Projeto',                 2,  true),
    (v_tpl, 'Fase 1 — Programa Base',               3,  true),
    (v_tpl, 'Fase 2 — Estudo Prévio',               4,  true),
    (v_tpl, 'Fase 3 — Projeto de Execução',         5,  true),
    (v_tpl, 'Fase opcional — Licenciamento',        6,  false),
    (v_tpl, 'Fase opcional — Mobiliário',           7,  false),
    (v_tpl, 'Fase opcional — Sinalética',           8,  false),
    (v_tpl, 'Assistência Técnica',                  9,  true),
    (v_tpl, 'Planeamento',                         10,  true),
    (v_tpl, 'Honorários',                          11,  true),
    (v_tpl, 'Condições de Pagamento',              12,  true),
    (v_tpl, 'Serviços Adicionais',                 13,  false),
    (v_tpl, 'Suspensão e Cessação',                14,  true),
    (v_tpl, 'Exclusões',                           15,  true),
    (v_tpl, 'Validade da Proposta',                16,  true),
    (v_tpl, 'Termo de Aceitação',                  17,  true);
END $$;
