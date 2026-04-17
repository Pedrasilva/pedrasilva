-- 1. Add email and vacation fields to collaborators
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS dias_ferias_anuais INTEGER NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS saldo_ferias_anterior INTEGER NOT NULL DEFAULT 0;

-- 2. Roles enum + user_roles table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function to check roles (no recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. Helper to get the collaborator linked to current user (by email)
CREATE OR REPLACE FUNCTION public.get_my_collaborator_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id FROM public.collaborators c
  WHERE c.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1
$$;

-- 5. RLS for user_roles
DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Auto-assign role on signup based on collaborator's department
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept public.department;
BEGIN
  SELECT departamento INTO v_dept
  FROM public.collaborators
  WHERE email = NEW.email
  LIMIT 1;

  IF v_dept = 'Backoffice' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Vacation requests table
CREATE TABLE IF NOT EXISTS public.vacation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  dias_uteis INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'aprovada', 'rejeitada')),
  notas TEXT,
  aprovado_por UUID REFERENCES auth.users(id),
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_vacation_requests_updated_at
  BEFORE UPDATE ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. RLS for vacation_requests
DROP POLICY IF EXISTS "Users see own + admins all" ON public.vacation_requests;
CREATE POLICY "Users see own + admins all" ON public.vacation_requests
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR collaborator_id = public.get_my_collaborator_id()
  );

DROP POLICY IF EXISTS "Users create own requests" ON public.vacation_requests;
CREATE POLICY "Users create own requests" ON public.vacation_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    collaborator_id = public.get_my_collaborator_id()
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins update; users update own pending" ON public.vacation_requests;
CREATE POLICY "Admins update; users update own pending" ON public.vacation_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (collaborator_id = public.get_my_collaborator_id() AND estado = 'pendente')
  );

DROP POLICY IF EXISTS "Admins delete; users delete own pending" ON public.vacation_requests;
CREATE POLICY "Admins delete; users delete own pending" ON public.vacation_requests
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (collaborator_id = public.get_my_collaborator_id() AND estado = 'pendente')
  );

-- 9. Tighten existing collaborators/snapshots/bo_settings policies (admin-only writes; authenticated reads)
DROP POLICY IF EXISTS "public read collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "public write collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "public update collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "public delete collaborators" ON public.collaborators;

CREATE POLICY "Authenticated read collaborators" ON public.collaborators
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write collaborators" ON public.collaborators
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update collaborators" ON public.collaborators
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete collaborators" ON public.collaborators
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "public read snapshots" ON public.salary_snapshots;
DROP POLICY IF EXISTS "public write snapshots" ON public.salary_snapshots;
DROP POLICY IF EXISTS "public update snapshots" ON public.salary_snapshots;
DROP POLICY IF EXISTS "public delete snapshots" ON public.salary_snapshots;

CREATE POLICY "Admins read snapshots" ON public.salary_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write snapshots" ON public.salary_snapshots
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update snapshots" ON public.salary_snapshots
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete snapshots" ON public.salary_snapshots
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "public read bo_settings" ON public.bo_settings;
DROP POLICY IF EXISTS "public write bo_settings" ON public.bo_settings;
DROP POLICY IF EXISTS "public update bo_settings" ON public.bo_settings;

CREATE POLICY "Admins read bo_settings" ON public.bo_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write bo_settings" ON public.bo_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update bo_settings" ON public.bo_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));