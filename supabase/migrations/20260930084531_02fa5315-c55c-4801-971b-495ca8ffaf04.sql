INSERT INTO public.role_permissions (role, permission_key, scope)
VALUES ('admin'::public.pm_role, 'reports.view', 'all') ON CONFLICT DO NOTHING;