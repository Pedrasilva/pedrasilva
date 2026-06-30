
INSERT INTO psa_block_library (kind, label, default_title, default_content_rich, default_source_type, default_source_ref, default_contract_relevance, sort_hint, is_system)
VALUES
  ('gantt_design', 'Design Gantt', 'Design Schedule', '{}'::jsonb, 'live_quote', '{"scope":"design"}'::jsonb, 'both', 61, true),
  ('gantt_construction', 'Construction Gantt', 'Construction Schedule', '{}'::jsonb, 'live_quote', '{"scope":"construction"}'::jsonb, 'both', 62, true);
