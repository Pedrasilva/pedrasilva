INSERT INTO public.role_permissions (role, permission_key, scope)
VALUES ('partner','timesheets.log','own'),
       ('hr','timesheets.log','own'),
       ('finance','timesheets.log','own')
ON CONFLICT DO NOTHING;