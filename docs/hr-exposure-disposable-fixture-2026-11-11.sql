-- Record of executed disposable-fixture SQL; not a policy/schema change.
-- Auth lifecycle used the administrative Auth API, never auth.users SQL.
INSERT INTO public.collaborators(id,nome,email,departamento,include_in_planning)
VALUES ('85589473-f888-4441-86cd-9eb8d3379576','[QA DISPOSABLE] HR exposure',
 'qa-hr-exposure-1fa713aa-ef7d-4f75-8107-2a9577aa08e6@example.invalid','Projecto',false);
DELETE FROM public.pm_resources WHERE collaborator_id='85589473-f888-4441-86cd-9eb8d3379576';
DELETE FROM public.collaborators WHERE id='85589473-f888-4441-86cd-9eb8d3379576'
 AND email='qa-hr-exposure-1fa713aa-ef7d-4f75-8107-2a9577aa08e6@example.invalid';
DELETE FROM public.user_permissions WHERE user_id='812844d3-2db4-4900-9a0b-aaa956c01c75';
DELETE FROM public.user_role_assignments WHERE user_id='812844d3-2db4-4900-9a0b-aaa956c01c75';
DELETE FROM public.user_roles WHERE user_id='812844d3-2db4-4900-9a0b-aaa956c01c75';