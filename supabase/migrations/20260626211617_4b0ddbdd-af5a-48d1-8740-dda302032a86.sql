-- 1. Extend template stages with fee + hours (idempotent)
ALTER TABLE public.quote_template_stages
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS default_hours numeric NOT NULL DEFAULT 0 CHECK (default_hours >= 0);

-- 2. Patch instantiate function to copy fee_amount → stage budget
CREATE OR REPLACE FUNCTION public.quote_instantiate_template(
  _quote_id uuid,
  _template_id uuid,
  _base_start_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_start date := COALESCE(_base_start_date, CURRENT_DATE);
  v_stage RECORD;
  v_running date;
  v_new_stage_id uuid;
  v_stage_count int := 0;
  v_dep_count int := 0;
  v_ext_count int := 0;
  v_pay_count int := 0;
  v_block_count int := 0;
  v_alloc_skipped int := 0;
  v_doc_id uuid;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fee_proposals WHERE id = _quote_id) THEN
    RAISE EXCEPTION 'quote not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quote_templates WHERE id = _template_id) THEN
    RAISE EXCEPTION 'template not found';
  END IF;

  CREATE TEMP TABLE _stage_map (
    stage_temp_key text PRIMARY KEY,
    new_stage_id uuid NOT NULL
  ) ON COMMIT DROP;

  v_running := v_start;
  FOR v_stage IN
    SELECT * FROM public.quote_template_stages
     WHERE template_id = _template_id
     ORDER BY sort_order, stage_temp_key
  LOOP
    INSERT INTO public.quote_stages(quote_id, name, start_date, end_date, sort_order, color, budget)
    VALUES (_quote_id, v_stage.title, v_running,
            v_running + (v_stage.duration_days - 1),
            v_stage.sort_order, v_stage.color,
            COALESCE(v_stage.fee_amount, 0))
    RETURNING id INTO v_new_stage_id;
    INSERT INTO _stage_map(stage_temp_key, new_stage_id)
    VALUES (v_stage.stage_temp_key, v_new_stage_id);
    v_running := v_running + v_stage.duration_days;
    v_stage_count := v_stage_count + 1;
  END LOOP;

  WITH ins AS (
    INSERT INTO public.quote_stage_dependencies(
      quote_id, predecessor_stage_id, successor_stage_id, type, lag_days
    )
    SELECT _quote_id, pm.new_stage_id, sm.new_stage_id, td.dependency_type, td.lag_days
    FROM public.quote_template_dependencies td
    JOIN _stage_map pm ON pm.stage_temp_key = td.predecessor_stage_temp_key
    JOIN _stage_map sm ON sm.stage_temp_key = td.successor_stage_temp_key
    WHERE td.template_id = _template_id
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_dep_count FROM ins;

  WITH ins AS (
    INSERT INTO public.quote_external_services(
      quote_id, stage_id, description, quantity, unit_cost, purchase_price, markup_type, markup_value
    )
    SELECT _quote_id, sm.new_stage_id, te.description, te.quantity, te.unit_cost,
           te.unit_cost * te.quantity, te.markup_type, te.markup_value
    FROM public.quote_template_external_services te
    LEFT JOIN _stage_map sm ON sm.stage_temp_key = te.stage_temp_key
    WHERE te.template_id = _template_id
    RETURNING 1
  )
  SELECT count(*) INTO v_ext_count FROM ins;

  WITH ins AS (
    INSERT INTO public.quote_payment_schedule_items(
      quote_id, stage_id, label, trigger_type, amount_type, amount_value, sort_order
    )
    SELECT _quote_id, sm.new_stage_id, tp.label, tp.trigger_type, tp.amount_type, tp.amount_value, tp.sort_order
    FROM public.quote_template_payment_rules tp
    LEFT JOIN _stage_map sm ON sm.stage_temp_key = tp.stage_temp_key
    WHERE tp.template_id = _template_id
    RETURNING 1
  )
  SELECT count(*) INTO v_pay_count FROM ins;

  SELECT id INTO v_doc_id FROM public.quote_proposal_documents
   WHERE quote_id = _quote_id ORDER BY created_at DESC LIMIT 1;
  IF v_doc_id IS NULL AND EXISTS (SELECT 1 FROM public.quote_template_blocks WHERE template_id = _template_id) THEN
    INSERT INTO public.quote_proposal_documents(quote_id, title, language)
    VALUES (_quote_id, 'Proposal', 'pt-PT')
    RETURNING id INTO v_doc_id;
  END IF;
  IF v_doc_id IS NOT NULL THEN
    WITH ins AS (
      INSERT INTO public.quote_proposal_document_blocks(
        proposal_document_id, proposal_block_id, block_title, block_type, content, sort_order, is_included
      )
      SELECT v_doc_id, tb.proposal_block_id, tb.block_title,
             COALESCE(pb.block_type, 'editable_text'::proposal_block_type),
             COALESCE(pb.default_content, ''),
             tb.sort_order, true
      FROM public.quote_template_blocks tb
      LEFT JOIN public.proposal_blocks pb ON pb.id = tb.proposal_block_id
      WHERE tb.template_id = _template_id
      RETURNING 1
    )
    SELECT count(*) INTO v_block_count FROM ins;
  END IF;

  SELECT count(*) INTO v_alloc_skipped
    FROM public.quote_template_allocations WHERE template_id = _template_id;

  RETURN jsonb_build_object(
    'stages', v_stage_count,
    'dependencies', v_dep_count,
    'external_services', v_ext_count,
    'payment_items', v_pay_count,
    'proposal_blocks', v_block_count,
    'allocations_skipped', v_alloc_skipped
  );
END $$;

-- 3. Seed
DO $seed$
DECLARE
  v_template_id uuid;
  v_cat_id uuid;
  v_block_desc uuid;
  v_block_phases uuid;
  v_block_p1 uuid;
  v_block_p2 uuid;
  v_block_p3 uuid;
  v_block_p4 uuid;
  v_block_p5 uuid;
  v_block_fees_notes uuid;
  v_block_payments uuid;
  v_block_deadlines uuid;
  v_block_exclusions uuid;
  v_block_validity uuid;
  v_block_acceptance uuid;
BEGIN
  SELECT id INTO v_cat_id FROM public.proposal_block_categories WHERE slug = 'habitacao' LIMIT 1;
  IF v_cat_id IS NULL THEN
    INSERT INTO public.proposal_block_categories(name, slug, description)
    VALUES ('Habitação', 'habitacao', 'Blocos para propostas de habitação unifamiliar.')
    RETURNING id INTO v_cat_id;
  END IF;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '1. Descrição do projeto', 'hab-descricao', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h2>1. Descrição do projeto</h2>
<p>A nossa proposta refere-se à elaboração dos estudos e projeto de arquitetura e assistência à execução da obra de construção de uma moradia nova, <strong>localizada em {{address}}</strong>.</p>
<p>Está prevista uma moradia de tipologia <strong>{{typology}}</strong> com <strong>{{area_m2}} m²</strong> de área de construção, organizada em <strong>{{floors}}</strong> pisos, de acordo com o estudo de áreas que fizemos após a nossa reunião e que apresentamos como anexo à nossa proposta. Faz também parte da proposta, a coordenação dos diversos projetos de especialidades com o projeto de arquitetura.</p>$$, 10)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_desc;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '2. As fases do projeto', 'hab-fases', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h2>2. As fases do projeto</h2>
<p>Propõe-se que o projeto se organize em 5 fases distintas:</p>
<ol>
  <li>Programa de Base / Conceito</li>
  <li>Estudo Prévio</li>
  <li>Projeto de Licenciamento</li>
  <li>Projeto de Execução</li>
  <li>Assistência Técnica</li>
</ol>$$, 20)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_phases;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '[1] Programa de Base / Conceito', 'hab-fase-1', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h3>[1] Programa de Base / Conceito</h3>
<p>Esta fase define os objetivos e conceito do Projeto. Vamos reunir toda a informação da sua parte que possibilite compreender as suas intenções para o Projeto e também toda a informação relevante para o seu desenvolvimento, tal como limitações ou restrições aplicáveis ao Projeto.</p>
<p>Nesta fase deverá facultar a seguinte informação:</p>
<ul>
  <li>Os seus objetivos para o projeto;</li>
  <li>As características gerais que deve satisfazer;</li>
  <li>Dados sobre a localização da obra;</li>
  <li>Levantamento topográfico do local a construir;</li>
  <li>Limites de custo e, eventualmente, indicações relativas ao financiamento da obra;</li>
  <li>Indicação geral dos prazos para a elaboração do projeto e para a execução da obra.</li>
</ul>
<p>O Conceito consiste em criar e desenvolver uma ideia de intervenção, estruturando um Programa Funcional e propondo uma determinada abordagem arquitetónica, de modo a cumprir com os seus objetivos.</p>
<p>Para esta fase, consideramos as seguintes tarefas:</p>
<ul>
  <li>Visita ao Local / Reunião com Cliente</li>
  <li>Investigação da Ideia</li>
  <li>Desenvolvimento da Ideia e do Programa Funcional, através de elementos escritos ou desenhados que permitam uma efetiva compreensão da proposta organizativa e funcional da intervenção</li>
  <li>Descrição de intenções e objetivos arquitetónicos através da apresentação de Mood Boards (imagens que referenciam exemplos de projetos e estabelecem um determinado ambiente como base para o desenvolvimento da fase de conceção). Estes Mood Boards são utilizados para aferir os gostos do Cliente e permitem uma apresentação visual das direções possíveis para Projeto.</li>
</ul>
<p><strong>Duração prevista da fase:</strong> 1 semana</p>$$, 30)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_p1;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '[2] Estudo Prévio', 'hab-fase-2', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h3>[2] Estudo Prévio</h3>
<p>Depois de definido e aprovado o "Programa Base", vamos desenvolver os conceitos que foram definidos e apresentar soluções através de Desenhos ou outros elementos que facilitem a sua compreensão do projeto, como a sua organização e a sua aparência final.</p>
<p>Iremos reunir com os projetistas dos projetos de Especialidades, no sentido de obter aconselhamento relativamente às soluções que estão a ser estudadas.</p>
<p>Fazem parte desta fase a apresentação dos elementos necessários para a definição da intervenção, tais como:</p>
<ul>
  <li>Estudos de plantas</li>
  <li>Estudos de cortes e alçados</li>
  <li>Estudos de volumetria</li>
  <li>Estudos de materiais</li>
  <li>Maquete de estudo</li>
  <li>Imagens 3D (3 imagens)</li>
  <li>Estimativa de custos genérica</li>
</ul>
<p>Prevemos ir ao encontro dos seus objetivos e gostos através da apresentação de uma proposta de estudo prévio, desenvolvida durante o tempo estimado e com os recursos previstos no planeamento apresentado.</p>
<p>A nossa equipa fará as necessárias afinações na proposta de estudo prévio de forma a obter a sua total satisfação, desde que estas estejam dentro do número de horas previsto na nossa proposta de honorários.</p>
<p><strong>Duração prevista da fase:</strong> 4 semanas</p>$$, 40)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_p2;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '[3] Licenciamento', 'hab-fase-3', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h3>[3] Licenciamento</h3>
<p>Após a sua aprovação do Estudo Prévio iremos iniciar a preparação de todos os elementos necessários ao Licenciamento da obra: peças escritas, peças desenhadas e documentos.</p>
<p>O Coordenador de Projeto vai reunir informação sobre os elementos a entregar na Câmara Municipal e demais autoridades responsáveis, e elaborar o processo de pedido de Licenciamento, com base nos elementos produzidos na fase anterior e de acordo com a legislação aplicável.</p>
<p>Estes elementos servem ainda de base ao desenvolvimento dos projetos de especialidades.</p>
<p>O projeto de licenciamento incluirá os seguintes elementos ou tarefas:</p>
<ul>
  <li>Peças desenhadas, peças escritas em formato de papel e/ou digital, a serem entregues na Câmara Municipal de acordo com o exigido pela respetiva Câmara.</li>
  <li>Entrega dos projetos na Câmara Municipal</li>
</ul>
<p><strong>Duração prevista da fase:</strong> 2 semanas</p>$$, 50)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_p3;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '[4] Projeto de Execução', 'hab-fase-4', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h3>[4] Projeto de Execução</h3>
<p>Esta fase consiste no desenvolvimento do projeto de arquitetura, em que iremos desenvolver soluções estéticas e construtivas de acordo com as suas intenções e com as condicionantes do Projeto. Faremos também a coordenação do projeto de Arquitetura com os diferentes projetos de Especialidades.</p>
<p>Iremos elaborar desenhos e elementos escritos que irão especificar todos materiais e trabalhos necessários para a execução da obra.</p>
<p>O seu projeto de execução incluirá assim os seguintes elementos ou tarefas:</p>
<ul>
  <li>Plantas gerais — Escala 1:50</li>
  <li>Plantas de acabamentos — Escala 1:50</li>
  <li>Plantas de tectos indicando materiais e pontos de iluminação — Escala 1:50</li>
  <li>Cortes — Escala 1:50</li>
  <li>Alçados — Escala 1:50</li>
  <li>Detalhes de zonas específicas, tais como instalações sanitárias, cozinhas e outras áreas conforme necessário — Escala 1:20</li>
  <li>Mapas de vãos e mobiliário — a escala apropriada</li>
  <li>Conjunto de detalhes construtivos — a escala apropriada</li>
  <li>Descrição de acabamentos e equipamentos</li>
</ul>
<p><strong>Duração prevista da fase:</strong> 5 semanas</p>$$, 60)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_p4;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '[5] Assistência Técnica', 'hab-fase-5', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h3>[5] Assistência Técnica</h3>
<p>Esta é a fase da construção do seu projeto, em que faremos o acompanhamento da obra através de reuniões na obra com o Empreiteiro Geral, a Fiscalização e os restantes Técnicos responsáveis pelos Projetos de Especialidades, tendo como objetivo garantir a correta interpretação do projeto de Arquitetura e o esclarecimento de eventuais dúvidas.</p>
<p>Nesta fase serão fornecidos desenhos ou outros elementos adicionais que esclareçam dúvidas ou omissões do projeto de execução.</p>
<p>A Assistência Técnica não constitui uma Fiscalização da Obra.</p>
<p><strong>Duração prevista da fase:</strong> 12 meses</p>$$, 70)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_p5;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '3. Honorários — notas', 'hab-honorarios-notas', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h2>3. Honorários</h2>
<p>Os nossos honorários são calculados em função de uma estimativa do tempo e dos recursos a utilizar para proceder à elaboração do seu projeto. Os valores apresentados na tabela acima não incluem IVA.</p>
<p>No que respeita à Assistência Técnica, apresentamos um valor mensal, que deverá ser pago durante o tempo em que decorre a obra e que inclui 2 visitas por mês à obra, o valor das respetivas deslocações e apoio de atelier necessário a esclarecimentos.</p>$$, 80)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_fees_notes;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '3.2 Condições de pagamento', 'hab-pagamento', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h3>3.2 Condições de pagamento</h3>
<p>Para iniciar o seu projeto propomos um pagamento de 10% da totalidade dos honorários como adjudicação.</p>
<p>Em cada fase de projeto será faturada 90% do valor correspondente a essa fase repartido por dois pagamentos: um no início e outro na conclusão da fase.</p>
<p>Na fase de Assistência Técnica, o valor mensal previsto deverá ser pago mensalmente durante o tempo que a obra decorrer.</p>$$, 90)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_payments;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '3.3 Prazos de execução de cada fase de projeto', 'hab-prazos', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h3>3.3 Prazos de execução de cada fase de projeto</h3>
<p>A data de início do projeto é definida como a data em que assinaremos o contrato e é feito o pagamento da adjudicação.</p>
<p>Os prazos de execução de cada fase de projeto são estabelecidos em função do planeamento feito pela nossa equipa e que serve de base à nossa proposta.</p>
<p>O início de cada fase está sempre dependente da sua aprovação da fase anterior e da informação que nos tem de facultar para podermos desenvolver o seu projeto.</p>
<p>Os prazos previstos poderão ter de ser ajustados em função de novos dados ou situações imprevistas não existentes à data da elaboração da nossa proposta.</p>$$, 100)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_deadlines;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '3.4 Exclusões', 'hab-exclusoes', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h3>3.4 Exclusões</h3>
<p>Estão excluídas da proposta:</p>
<ul>
  <li>IVA à taxa legal em vigor</li>
  <li>Despesas de deslocação como viagens, alojamento, refeições e despesas diversas associadas, fora do Concelho de Lisboa, que não estão contempladas no capítulo da Assistência Técnica.</li>
  <li>Levantamentos topográficos</li>
  <li>Levantamentos arquitetónicos</li>
  <li>Taxas Camarárias</li>
  <li>Projetos de especialidades</li>
  <li>Preparação e Lançamento de Concurso de Empreitadas</li>
  <li>Direção técnica da obra, Administração da obra, Coordenação e Fiscalização da obra</li>
  <li>Elaboração de desenhos de preparação de obra</li>
  <li>Mapa de Quantidades e Medições</li>
  <li>Estimativa Orçamental</li>
  <li>Imagens 3D — <em>para além das que estão previstas na fase de Estudo Prévio</em></li>
  <li>Maquetes</li>
  <li>Caderno de encargos — <em>na fase de execução</em></li>
  <li>Condições técnicas especiais — <em>na fase de execução</em></li>
  <li>Processo de obtenção de licença de utilização (telas finais + outros documentos para Câmara Municipal) — <em>na fase após a obra</em></li>
  <li>Projeto de decoração de interiores</li>
</ul>$$, 110)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_exclusions;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, '4. Validade e aceitação da Proposta', 'hab-validade', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h2>4. Validade e aceitação da Proposta</h2>
<p>Esta proposta é válida por um período de 60 dias.</p>
<p>Esperamos que esta proposta vá ao encontro das suas expectativas e estamos disponíveis para o esclarecimento de qualquer questão. Caso aceitem esta proposta, agradecemos a devolução desta carta, com os dados abaixo preenchidos e assinada.</p>
<p>Melhores Cumprimentos,</p>
<p>Luís Pedra Silva</p>$$, 120)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_validity;

  INSERT INTO public.proposal_blocks(category_id, title, slug, language, project_type_tags, block_type, default_content, sort_order)
  VALUES (v_cat_id, 'Termo de aceitação', 'hab-aceitacao', 'pt-PT', ARRAY['residential'], 'editable_text',
$$<h2>Termo de aceitação</h2>
<p>Aceito esta proposta, nos termos acima descritos.</p>
<p>Data: ___ de _______________ de {{proposal_year}}</p>
<p>Assinatura: __________________________________________________</p>$$, 130)
  ON CONFLICT (slug, language) DO UPDATE SET default_content = EXCLUDED.default_content RETURNING id INTO v_block_acceptance;

  -- Template (idempotent by name)
  SELECT id INTO v_template_id FROM public.quote_templates WHERE name = 'Habitação — Construção Nova' LIMIT 1;
  IF v_template_id IS NULL THEN
    INSERT INTO public.quote_templates(name, description, category, project_type, is_active)
    VALUES ('Habitação — Construção Nova',
            'Proposta padrão Pedra Silva para construção nova de moradia unifamiliar. 5 fases: Programa Base, Estudo Prévio, Licenciamento, Execução, Assistência Técnica.',
            'project', 'residential', true)
    RETURNING id INTO v_template_id;
  ELSE
    DELETE FROM public.quote_template_stages WHERE template_id = v_template_id;
    DELETE FROM public.quote_template_dependencies WHERE template_id = v_template_id;
    DELETE FROM public.quote_template_payment_rules WHERE template_id = v_template_id;
    DELETE FROM public.quote_template_blocks WHERE template_id = v_template_id;
  END IF;

  INSERT INTO public.quote_template_stages(template_id, stage_temp_key, sort_order, title, duration_days, fee_amount, default_hours, color) VALUES
    (v_template_id, 'p1', 1, '[1] Programa Base / Conceito', 7,   400,    10,  '#a78bfa'),
    (v_template_id, 'p2', 2, '[2] Estudo Prévio',            28,  7400,  200,  '#22c55e'),
    (v_template_id, 'p3', 3, '[3] Licenciamento',            14,  4500,  120,  '#f59e0b'),
    (v_template_id, 'p4', 4, '[4] Projeto de Execução',      35,  9250,  250,  '#3b82f6'),
    (v_template_id, 'at', 5, '[5] Assistência Técnica',      365, 9312,  240,  '#ef4444');

  INSERT INTO public.quote_template_dependencies(template_id, predecessor_stage_temp_key, successor_stage_temp_key, dependency_type, lag_days) VALUES
    (v_template_id, 'p1', 'p2', 'FS', 0),
    (v_template_id, 'p2', 'p3', 'FS', 0),
    (v_template_id, 'p3', 'p4', 'FS', 0),
    (v_template_id, 'p4', 'at', 'FS', 0);

  INSERT INTO public.quote_template_payment_rules(template_id, stage_temp_key, sort_order, label, trigger_type, amount_type, amount_value) VALUES
    (v_template_id, NULL, 1,  'Adjudicação (10%)',                       'project_start', 'fixed', 3086.20),
    (v_template_id, 'p1', 10, '[1] Programa Base — início (45%)',         'stage_start',  'fixed', 180.00),
    (v_template_id, 'p1', 11, '[1] Programa Base — conclusão (45%)',      'stage_end',    'fixed', 180.00),
    (v_template_id, 'p2', 20, '[2] Estudo Prévio — início (45%)',         'stage_start',  'fixed', 3330.00),
    (v_template_id, 'p2', 21, '[2] Estudo Prévio — conclusão (45%)',      'stage_end',    'fixed', 3330.00),
    (v_template_id, 'p3', 30, '[3] Licenciamento — início (45%)',         'stage_start',  'fixed', 2025.00),
    (v_template_id, 'p3', 31, '[3] Licenciamento — conclusão (45%)',      'stage_end',    'fixed', 2025.00),
    (v_template_id, 'p4', 40, '[4] Projeto de Execução — início (45%)',   'stage_start',  'fixed', 4162.50),
    (v_template_id, 'p4', 41, '[4] Projeto de Execução — conclusão (45%)','stage_end',    'fixed', 4162.50),
    (v_template_id, 'at', 50, '[5] Assistência Técnica — mensal',         'monthly',      'fixed', 776.00);

  INSERT INTO public.quote_template_blocks(template_id, proposal_block_id, block_title, sort_order, required) VALUES
    (v_template_id, v_block_desc,       '1. Descrição do projeto',                   10,  true),
    (v_template_id, v_block_phases,     '2. As fases do projeto',                    20,  true),
    (v_template_id, v_block_p1,         '[1] Programa de Base / Conceito',           30,  true),
    (v_template_id, v_block_p2,         '[2] Estudo Prévio',                         40,  true),
    (v_template_id, v_block_p3,         '[3] Licenciamento',                         50,  true),
    (v_template_id, v_block_p4,         '[4] Projeto de Execução',                   60,  true),
    (v_template_id, v_block_p5,         '[5] Assistência Técnica',                   70,  true),
    (v_template_id, v_block_fees_notes, '3. Honorários — notas',                     80,  true),
    (v_template_id, v_block_payments,   '3.2 Condições de pagamento',                90,  true),
    (v_template_id, v_block_deadlines,  '3.3 Prazos de execução',                    100, true),
    (v_template_id, v_block_exclusions, '3.4 Exclusões',                             110, true),
    (v_template_id, v_block_validity,   '4. Validade e aceitação',                   120, true),
    (v_template_id, v_block_acceptance, 'Termo de aceitação',                        130, true);
END
$seed$;