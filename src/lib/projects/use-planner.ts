import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  Project,
  Stage,
  Resource,
  Allocation,
  AllocationWithResource,
  StageWithAllocations,
} from "@/lib/projects/types";
import { type StageDependency, type DepType } from "@/lib/projects/dependencies";
import { changeGanttStage, changeGanttDependency, projectScopeForDependency } from "./gantt-schedule";
import i18n from '@/i18n';

// ---------- PROJECTS ----------

export function useProjects() {
  return useQuery({
    queryKey: ["pm-projects"],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from("pm_projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      client?: string;
      color?: string;
      start_date: string;
    }): Promise<Project> => {
      const { data, error } = await supabase.from("pm_projects").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-projects"] }),
  });
}

export type ProjectStatus = "active" | "paused" | "closing" | "archived";

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<Project, "name" | "client" | "color" | "start_date" | "notes" | "status" | "company_id">
      >;
    }): Promise<Project> => {
      const { data, error } = await supabase
        .from("pm_projects")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-projects"] });
      qc.invalidateQueries({ queryKey: ["pm-project", vars.id] });
    },
  });
}

// ---------- PROJECT DETAIL (stages + allocations) ----------

export function useProjectDetail(projectId: string, opts?: { includeCancelled?: boolean }) {
  const includeCancelled = opts?.includeCancelled ?? false;
  return useQuery({
    queryKey: ["pm-project", projectId, includeCancelled],
    queryFn: async (): Promise<{ project: Project; stages: StageWithAllocations[] }> => {
      const [{ data: project, error: pErr }, { data: stages, error: sErr }] = await Promise.all([
        supabase.from("pm_projects").select("*").eq("id", projectId).single(),
        supabase
          .from("pm_stages")
          .select("*, allocations:pm_allocations(*, resource:pm_resources(*))")
          .eq("project_id", projectId)
          .order("sort_order", { ascending: true }),
      ]);
      if (pErr) throw pErr;
      if (sErr) throw sErr;
      const rows = (stages ?? []) as unknown as StageWithAllocations[];
      // RLS on pm_resources may hide rows from non-finance users; the embed
      // comes back as `null` in that case. Drop those allocations so the
      // detail page (which assumes resource is present) can still render.
      const sanitized = rows.map((s) => ({
        ...s,
        allocations: (s.allocations ?? []).filter((a) => !!a?.resource && !a.planning_removed_at),
      }));
      const filtered = includeCancelled
        ? sanitized
        : sanitized.filter((s) => (s as { status?: string }).status !== "cancelled");
      return { project: project!, stages: filtered };
    },
    enabled: !!projectId,
  });
}

export function useAllStages(opts?: { includeCancelled?: boolean }) {
  const includeCancelled = opts?.includeCancelled ?? false;
  return useQuery({
    queryKey: ["pm-stages-all", includeCancelled],
    queryFn: async (): Promise<StageWithAllocations[]> => {
      const { data, error } = await supabase
        .from("pm_stages")
        .select("*, allocations:pm_allocations(*, resource:pm_resources(*))")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as StageWithAllocations[];
      const sanitized = rows.map((s) => ({
        ...s,
        allocations: (s.allocations ?? []).filter((a) => !!a?.resource && !a.planning_removed_at),
      }));
      return includeCancelled
        ? sanitized
        : sanitized.filter((s) => (s as { status?: string }).status !== "cancelled");
    },
  });
}

// ---------- STAGES ----------

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      project_id: string;
      name: string;
      budget: number;
      start_date: string;
      end_date: string;
      color?: string;
      sort_order?: number;
      parent_stage_id?: string | null;
      is_milestone?: boolean;
    }): Promise<Stage> => {
      const { data, error } = await supabase.from("pm_stages").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.project_id] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Stage, "name" | "budget" | "start_date" | "end_date" | "color" | "sort_order" | "parent_stage_id" | "is_milestone">> & { status?: "planned" | "active" | "done" | "cancelled" };
      projectId: string;
    }): Promise<Stage> => {
      const { data, error } = await supabase
        .from("pm_stages")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

/**
 * Move/resize a stage with cascade through dependencies.
 *
 * Default behavior: when a stage is moved (start delta == end delta, i.e.
 * a pure shift, not a resize), all of its allocations shift by the same
 * number of calendar days. This keeps live resource planning aligned with
 * the baseline plan unless the user explicitly opts out (`shiftAllocations: false`).
 */
export function useUpdateStageWithCascade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      start_date,
      end_date,
      projectId: _projectId,
      shiftAllocations = true,
      move = false,
    }: {
      id: string;
      start_date: string;
      end_date: string;
      projectId: string;
      shiftAllocations?: boolean;
      move?: boolean;
    }): Promise<{ updatedIds: string[]; shiftedAllocations: number; dependentCount: number }> => {
      void shiftAllocations;
      return changeGanttStage("project", _projectId, id, start_date, end_date, move);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
      qc.invalidateQueries({ queryKey: ["pm-stage-dependencies"] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
    },
  });
}

// ---------- STAGE BASELINE ----------

/**
 * Lock the current working values (start, end, budget, target hours) as the
 * project baseline. Used as the reference for variance and stage health.
 * Once set, the baseline is preserved until an explicit re-baseline call.
 */
export function useSetStageBaseline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      projectId: _projectId,
      baseline_start_date,
      baseline_end_date,
      baseline_budget,
      baseline_target_hours,
      baseline_notes,
    }: {
      id: string;
      projectId: string;
      baseline_start_date: string;
      baseline_end_date: string;
      baseline_budget: number;
      baseline_target_hours: number;
      baseline_notes?: string | null;
    }): Promise<Stage> => {
      const { data, error } = await supabase
        .from("pm_stages")
        .update({
          baseline_start_date,
          baseline_end_date,
          baseline_budget,
          baseline_target_hours,
          baseline_locked_at: new Date().toISOString(),
          baseline_notes: baseline_notes ?? null,
        } as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Stage;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

export function useClearStageBaseline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId: _projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase
        .from("pm_stages")
        .update({
          baseline_start_date: null,
          baseline_end_date: null,
          baseline_budget: null,
          baseline_target_hours: null,
          baseline_locked_at: null,
          baseline_notes: null,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const { error } = await supabase.from("pm_stages").delete().eq("id", id);
      if (error?.message.includes("logged_history_delete_blocked")) throw new Error(i18n.t("projects:historySafety.blocked"));
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

// ---------- STAGE DEPENDENCIES ----------

export function useStageDependencies() {
  return useQuery({
    queryKey: ["pm-stage-dependencies"],
    queryFn: async (): Promise<StageDependency[]> => {
      const { data, error } = await supabase.from("pm_stage_dependencies").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as StageDependency[];
    },
  });
}

export function useCreateDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      predecessor_id: string;
      successor_id: string;
      type?: DepType;
      lag_days?: number;
    }): Promise<StageDependency> => {
      const scope = await projectScopeForDependency(input);
      return await changeGanttDependency("project",scope,"create",input) as StageDependency;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-stage-dependencies"] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
    },
  });
}

export function useUpdateDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<StageDependency, "type" | "lag_days">>;
    }): Promise<StageDependency> => {
      const scope = await projectScopeForDependency({id});
      return await changeGanttDependency("project",scope,"update",{id,...patch}) as StageDependency;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-stage-dependencies"] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
    },
  });
}

export function useDeleteDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const scope = await projectScopeForDependency({id});
      await changeGanttDependency("project",scope,"delete",{id});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-stage-dependencies"] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
      qc.invalidateQueries({ queryKey: ["pm-project"] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
    },
  });
}

// ---------- RESOURCES ----------

export function useResources() {
  return useQuery({
    queryKey: ["pm-resources"],
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await supabase
        .from("pm_resources")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ResourceTeam = "project" | "back_office";

export type ResourceInput = {
  name: string;
  role?: string | null;
  hourly_rate: number;
  hourly_rate_is_override?: boolean;
  weekly_capacity: number;
  color?: string;
  team?: ResourceTeam;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  active?: boolean;
};

export function useCreateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: ResourceInput & {
        cost_rate?: number;
        sale_rate?: number;
        rate_effective_from?: string;
      },
    ): Promise<Resource> => {
      const { cost_rate, sale_rate, rate_effective_from, ...resourceInput } = input;
      const { data, error } = await supabase
        .from("pm_resources")
        .insert(resourceInput as never)
        .select()
        .single();
      if (error) throw error;

      if (cost_rate != null && sale_rate != null) {
        const { error: rErr } = await supabase.from("pm_resource_rates").insert({
          resource_id: data.id,
          effective_from: rate_effective_from ?? new Date().toISOString().slice(0, 10),
          cost_rate,
          sale_rate,
        });
        if (rErr) throw rErr;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-resources"] }),
  });
}

export function useUpdateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ResourceInput> }): Promise<Resource> => {
      const { data, error } = await supabase
        .from("pm_resources")
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-resources"] }),
  });
}

export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-resources"] }),
  });
}

// ---------- RESOURCE RATES ----------

export type ResourceRate = {
  id: string;
  resource_id: string;
  effective_from: string;
  cost_rate: number;
  sale_rate: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function useResourceRates(resourceId: string | undefined) {
  return useQuery({
    queryKey: ["pm-resource-rates", resourceId],
    queryFn: async (): Promise<ResourceRate[]> => {
      if (!resourceId) return [];
      const { data, error } = await supabase
        .from("pm_resource_rates")
        .select("*")
        .eq("resource_id", resourceId)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ResourceRate[];
    },
    enabled: !!resourceId,
  });
}

export function useCreateResourceRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      resource_id: string;
      effective_from: string;
      cost_rate: number;
      sale_rate: number;
      notes?: string | null;
    }): Promise<ResourceRate> => {
      const { data, error } = await supabase
        .from("pm_resource_rates")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ResourceRate;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-resource-rates", vars.resource_id] });
      qc.invalidateQueries({ queryKey: ["pm-resources"] });
    },
  });
}

export function useUpdateResourceRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      resource_id: string;
      patch: Partial<Pick<ResourceRate, "effective_from" | "cost_rate" | "sale_rate" | "notes">>;
    }): Promise<ResourceRate> => {
      const { data, error } = await supabase
        .from("pm_resource_rates")
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ResourceRate;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-resource-rates", vars.resource_id] });
    },
  });
}

export function useDeleteResourceRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; resource_id: string }) => {
      const { error } = await supabase.from("pm_resource_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-resource-rates", vars.resource_id] });
    },
  });
}

// ---------- ALLOCATIONS ----------

export type AllocationFull = Allocation & {
  stage: Stage & { project: Project };
  resource: Resource;
};

export function useAllAllocations() {
  return useQuery({
    queryKey: ["pm-allocations-all"],
    queryFn: async (): Promise<AllocationFull[]> => {
      const { data, error } = await supabase
        .from("pm_allocations")
        .select("*, stage:pm_stages(*, project:pm_projects(*)), resource:pm_resources(*)").is("planning_removed_at", null);
      if (error) throw error;
      return (data ?? []) as unknown as AllocationFull[];
    },
  });
}

export function useCreateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      stage_id: string;
      resource_id: string;
      start_date: string;
      end_date: string;
      hours_per_day: number;
      projectId: string;
      allocation_percentage?: number | null;
    }): Promise<AllocationWithResource> => {
      const { projectId: _ignore, ...payload } = input;
      const children = await supabase.from('pm_stages').select('id').eq('parent_stage_id', input.stage_id).limit(1);
      if (children.error) throw children.error;
      if (children.data?.length) throw new Error(i18n.t('projects:weekPlan.parentStageBlocked'));
      const { data, error } = await supabase
        .from("pm_allocations")
        .insert(payload)
        .select("*, resource:pm_resources(*)")
        .single();
      if (error) throw error;
      return data as unknown as AllocationWithResource;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

export type AllocationStatus = "tentative" | "committed";

export function useUpdateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Allocation, "start_date" | "end_date" | "hours_per_day" | "stage_id">> & {
        status?: AllocationStatus;
        allocation_percentage?: number | null;
      };
      projectId: string;
    }): Promise<Allocation> => {
      const { data, error } = await supabase
        .from("pm_allocations")
        .update(patch as never)
        .is("planning_removed_at", null)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

/**
 * Toggle an allocation between `tentative` (soft-booked) and `committed`
 * (firm). Tentative allocations remain visible but are weighted down in
 * load calculations and excluded from "committed delivery" KPIs.
 */
export function useSetAllocationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      projectId: _projectId,
    }: {
      id: string;
      status: AllocationStatus;
      projectId: string;
    }): Promise<Allocation> => {
      const { data, error } = await supabase
        .from("pm_allocations")
        .update({ status } as never)
        .is("planning_removed_at", null)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

export function useDeleteAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const { error } = await supabase.from("pm_allocations").update({ planning_removed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}
