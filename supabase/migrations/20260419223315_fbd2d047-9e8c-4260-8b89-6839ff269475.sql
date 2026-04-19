-- =========================================================================
-- MODULE: Projects (Project Management) — prefix pm_
-- =========================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.pm_project_status AS ENUM ('active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pm_task_status AS ENUM ('pending', 'active', 'paused', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pm_dep_type AS ENUM ('FS', 'SS', 'FF', 'SF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- pm_projects
-- =========================================================================
CREATE TABLE public.pm_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  client TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.pm_project_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pm_projects_status ON public.pm_projects(status);
ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_projects" ON public.pm_projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_projects" ON public.pm_projects
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update pm_projects" ON public.pm_projects
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete pm_projects" ON public.pm_projects
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pm_projects_updated
  BEFORE UPDATE ON public.pm_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- pm_stages
-- =========================================================================
CREATE TABLE public.pm_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  color TEXT NOT NULL DEFAULT '#22c55e',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pm_stages_project ON public.pm_stages(project_id);
ALTER TABLE public.pm_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_stages" ON public.pm_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_stages" ON public.pm_stages
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update pm_stages" ON public.pm_stages
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete pm_stages" ON public.pm_stages
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pm_stages_updated
  BEFORE UPDATE ON public.pm_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- pm_resources (with optional FK to HR collaborators)
-- =========================================================================
CREATE TABLE public.pm_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collaborator_id UUID REFERENCES public.collaborators(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT,
  team TEXT NOT NULL DEFAULT 'project',
  hourly_rate NUMERIC(8,2) NOT NULL DEFAULT 100,
  weekly_capacity NUMERIC(5,2) NOT NULL DEFAULT 40,
  color TEXT NOT NULL DEFAULT '#a78bfa',
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_resources_team_check CHECK (team IN ('project', 'back_office'))
);
CREATE INDEX idx_pm_resources_team ON public.pm_resources(team);
CREATE INDEX idx_pm_resources_collaborator ON public.pm_resources(collaborator_id);
ALTER TABLE public.pm_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_resources" ON public.pm_resources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_resources" ON public.pm_resources
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update pm_resources" ON public.pm_resources
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete pm_resources" ON public.pm_resources
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pm_resources_updated
  BEFORE UPDATE ON public.pm_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- pm_allocations
-- =========================================================================
CREATE TABLE public.pm_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES public.pm_stages(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.pm_resources(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours_per_day NUMERIC(5,2) NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pm_allocations_stage ON public.pm_allocations(stage_id);
CREATE INDEX idx_pm_allocations_resource ON public.pm_allocations(resource_id);
ALTER TABLE public.pm_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_allocations" ON public.pm_allocations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_allocations" ON public.pm_allocations
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update pm_allocations" ON public.pm_allocations
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete pm_allocations" ON public.pm_allocations
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pm_allocations_updated
  BEFORE UPDATE ON public.pm_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- pm_tasks (auto-created from allocations)
-- =========================================================================
CREATE TABLE public.pm_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  allocation_id UUID NOT NULL UNIQUE REFERENCES public.pm_allocations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status public.pm_task_status NOT NULL DEFAULT 'pending',
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pm_tasks_status ON public.pm_tasks(status);
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_tasks" ON public.pm_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_tasks" ON public.pm_tasks
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update pm_tasks" ON public.pm_tasks
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete pm_tasks" ON public.pm_tasks
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pm_tasks_updated
  BEFORE UPDATE ON public.pm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create a task whenever an allocation is created
CREATE OR REPLACE FUNCTION public.pm_create_task_for_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stage_name text;
BEGIN
  SELECT name INTO stage_name FROM public.pm_stages WHERE id = NEW.stage_id;
  INSERT INTO public.pm_tasks (allocation_id, name, status)
    VALUES (NEW.id, COALESCE(stage_name, 'Tarefa'), 'pending');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pm_create_task_for_allocation
  AFTER INSERT ON public.pm_allocations
  FOR EACH ROW EXECUTE FUNCTION public.pm_create_task_for_allocation();

-- Auto-stamp activated_at / completed_at on status change
CREATE OR REPLACE FUNCTION public.pm_stamp_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') AND NEW.activated_at IS NULL THEN
    NEW.activated_at = now();
  END IF;
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') AND NEW.completed_at IS NULL THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pm_stamp_task_status
  BEFORE UPDATE OF status ON public.pm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.pm_stamp_task_status_change();

-- =========================================================================
-- pm_time_entries
-- =========================================================================
CREATE TABLE public.pm_time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pm_time_entries_task ON public.pm_time_entries(task_id);
CREATE INDEX idx_pm_time_entries_user_date ON public.pm_time_entries(user_id, entry_date DESC);

-- Only ONE running timer per user at a time
CREATE UNIQUE INDEX uq_pm_time_entries_one_running
  ON public.pm_time_entries(user_id)
  WHERE ended_at IS NULL AND started_at IS NOT NULL;

ALTER TABLE public.pm_time_entries ENABLE ROW LEVEL SECURITY;

-- Users see their own + admins see all
CREATE POLICY "Users see own time entries + admins all" ON public.pm_time_entries
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Users create own time entries" ON public.pm_time_entries
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Users update own time entries; admins all" ON public.pm_time_entries
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Users delete own time entries; admins all" ON public.pm_time_entries
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE TRIGGER trg_pm_time_entries_updated
  BEFORE UPDATE ON public.pm_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- pm_stage_dependencies (with cycle prevention)
-- =========================================================================
CREATE TABLE public.pm_stage_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID NOT NULL REFERENCES public.pm_stages(id) ON DELETE CASCADE,
  successor_id UUID NOT NULL REFERENCES public.pm_stages(id) ON DELETE CASCADE,
  type public.pm_dep_type NOT NULL DEFAULT 'FS',
  lag_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_stage_dep_no_self CHECK (predecessor_id <> successor_id),
  CONSTRAINT pm_stage_dep_unique UNIQUE (predecessor_id, successor_id, type)
);
CREATE INDEX idx_pm_stage_dep_predecessor ON public.pm_stage_dependencies(predecessor_id);
CREATE INDEX idx_pm_stage_dep_successor ON public.pm_stage_dependencies(successor_id);
ALTER TABLE public.pm_stage_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read pm_stage_dependencies" ON public.pm_stage_dependencies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pm_stage_dependencies" ON public.pm_stage_dependencies
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update pm_stage_dependencies" ON public.pm_stage_dependencies
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete pm_stage_dependencies" ON public.pm_stage_dependencies
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pm_stage_dependencies_updated
  BEFORE UPDATE ON public.pm_stage_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cycle prevention
CREATE OR REPLACE FUNCTION public.pm_check_stage_dependency_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  cycle_found boolean;
BEGIN
  WITH RECURSIVE descendants AS (
    SELECT successor_id AS node FROM public.pm_stage_dependencies
      WHERE predecessor_id = NEW.successor_id
    UNION
    SELECT d.successor_id FROM public.pm_stage_dependencies d
      JOIN descendants ON d.predecessor_id = descendants.node
  )
  SELECT EXISTS (SELECT 1 FROM descendants WHERE node = NEW.predecessor_id)
    INTO cycle_found;

  IF cycle_found OR NEW.predecessor_id = NEW.successor_id THEN
    RAISE EXCEPTION 'Cyclic stage dependency rejected (% -> %)', NEW.predecessor_id, NEW.successor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pm_stage_dependencies_no_cycle
  BEFORE INSERT OR UPDATE ON public.pm_stage_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.pm_check_stage_dependency_cycle();