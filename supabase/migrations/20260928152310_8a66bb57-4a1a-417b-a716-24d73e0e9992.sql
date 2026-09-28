INSERT INTO public.role_permissions (role, permission_key, scope)
SELECT r, k, 'all' FROM unnest(enum_range(NULL::public.pm_role)) AS r
CROSS JOIN (VALUES ('products.view'), ('portfolio.view')) AS v(k)
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key, scope)
VALUES ('admin', 'inventory.view', 'all') ON CONFLICT DO NOTHING;