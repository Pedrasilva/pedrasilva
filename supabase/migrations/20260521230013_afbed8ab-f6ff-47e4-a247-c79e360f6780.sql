
DO $seed$
DECLARE
  tpl_id uuid;
  stage_keys text[] := ARRAY[
    's1_workplace_strategy','s2_concept_design','s3_developed_design',
    's4_technical_design','s5_procurement_tender','s6_construction_assist','s7_close_out'
  ];
  stage_titles text[] := ARRAY[
    'Workplace Strategy / Programme Definition','Concept Design',
    'Developed / Schematic Design','Technical Design',
    'Procurement / Tender Support','Construction Assistance','Close Out / Handover'
  ];
  stage_billing quote_payment_trigger[] := ARRAY[
    'stage_end','stage_end','stage_end','stage_end','stage_end','monthly','stage_end'
  ]::quote_payment_trigger[];
  i int;
  tpl_json jsonb;
  templates jsonb := '[
    {"name":"Workplace / Office — Large","project_type":"office","description":"Full PSA workplace / office fit-out, large scale."},
    {"name":"Workplace / Office — Small","project_type":"office","description":"PSA workplace / office fit-out, small scale."},
    {"name":"Health Clinic","project_type":"generic","description":"Healthcare clinic interior design proposal."},
    {"name":"Dental Clinic","project_type":"generic","description":"Dental clinic interior design proposal."},
    {"name":"Hotel","project_type":"hotel","description":"Hotel / hospitality interior design proposal."},
    {"name":"Residential","project_type":"residential","description":"Residential interior architecture proposal."}
  ]'::jsonb;
BEGIN
  FOR tpl_json IN SELECT * FROM jsonb_array_elements(templates) LOOP
    IF EXISTS (SELECT 1 FROM quote_templates WHERE name = (tpl_json->>'name') AND category = 'project') THEN
      CONTINUE;
    END IF;

    INSERT INTO quote_templates (name, description, category, project_type)
    VALUES (
      tpl_json->>'name',
      tpl_json->>'description',
      'project'::crm_quote_category,
      tpl_json->>'project_type'
    )
    RETURNING id INTO tpl_id;

    FOR i IN 1..array_length(stage_keys, 1) LOOP
      INSERT INTO quote_template_stages (
        template_id, stage_temp_key, sort_order, title,
        duration_days, fee_percentage, color, billing_trigger_default
      ) VALUES (
        tpl_id, stage_keys[i], i - 1, stage_titles[i],
        7, 0, '#22c55e', stage_billing[i]
      );
    END LOOP;

    FOR i IN 1..(array_length(stage_keys, 1) - 1) LOOP
      INSERT INTO quote_template_dependencies (
        template_id, predecessor_stage_temp_key, successor_stage_temp_key,
        dependency_type, lag_days
      ) VALUES (tpl_id, stage_keys[i], stage_keys[i + 1], 'FS', 0);
    END LOOP;
  END LOOP;
END $seed$;
