INSERT INTO auth.users(id,email) VALUES('10000000-0000-4000-a000-000000000001','admin@fixture.invalid'),('10000000-0000-4000-a000-000000000002','rioja@fixture.invalid');
INSERT INTO user_roles(user_id,role) VALUES('10000000-0000-4000-a000-000000000001','admin');
INSERT INTO finance_entities(id,name,nif) VALUES('00000000-0000-4000-a000-000000000001','Fixture PSA','fixture-psa'),('e0b3ac8e-97a5-4fb1-a2b0-53f65125d114','Fixture Rioja','fixture-rioja');
INSERT INTO finance_entity_members(user_id,entity_id) VALUES('10000000-0000-4000-a000-000000000002','e0b3ac8e-97a5-4fb1-a2b0-53f65125d114');
INSERT INTO user_permissions(user_id,permission_key) VALUES('10000000-0000-4000-a000-000000000002','finance.dashboard');
INSERT INTO finance_entity_preferences(user_id,entity_id) VALUES('10000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000001'),('10000000-0000-4000-a000-000000000002','e0b3ac8e-97a5-4fb1-a2b0-53f65125d114');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-a000-000000000001',false);
