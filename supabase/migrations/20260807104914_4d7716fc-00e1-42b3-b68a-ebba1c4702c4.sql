-- 1. Immediate per-user unblock (both Ricardo accounts, architect role)
INSERT INTO public.user_permissions (user_id, permission_key, scope, granted)
SELECT u.id, k.key, 'assigned', true
FROM auth.users u
CROSS JOIN (VALUES ('projects.edit_planning'), ('projects.edit_stages')) AS k(key)
WHERE u.email IN ('ricardo@pedrasilva.com', 'rc@pedrasilva.com')
ON CONFLICT (user_id, permission_key, scope) DO UPDATE SET granted = true;

-- 2. Architect role baseline: allow editing plans of assigned projects
INSERT INTO public.role_permissions (role, permission_key, scope)
VALUES ('architect', 'projects.edit_planning', 'assigned'),
       ('architect', 'projects.edit_stages', 'assigned')
ON CONFLICT DO NOTHING;