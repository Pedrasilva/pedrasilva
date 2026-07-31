INSERT INTO public.role_permissions (role, permission_key, scope)
VALUES ('hr', 'projects.view_financials', 'all'),
       ('hr', 'projects.view_margins', 'all')
ON CONFLICT DO NOTHING;