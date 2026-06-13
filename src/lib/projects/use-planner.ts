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
import { computeCascade, type StageDependency, type DepType } from "@/lib/projects/dependencies";

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

export type ProjectStatus = "active" | "paused" | "archived";

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Project, "name" | "client" | "color" | "start_date" | "notes" | "status">>;
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

export function useProjectDetail(projectId: string) {
  return useQuery({
    queryKey: ["pm-project", projectId],
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
      return { project: project!, stages: (stages ?? []) as unknown as StageWithAllocations[] };
    },
    enabled: !!projectId,
  });
}

export function useAllStages() {
  return useQuery({
    queryKey: ["pm-stages-all"],
    queryFn: async (): Promise<StageWithAllocations[]> => {
      const { data, error } = await supabase
        .from("pm_stages")
        .select("*, allocations:pm_allocations(*, resource:pm_resources(*))")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StageWithAllocations[];
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
      patch: Partial<Pick<Stage, "name" | "budget" | "start_date" | "end_date" | "color" | "sort_order">>;
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
    }: {
      id: string;
      start_date: string;
      end_date: string;
      projectId: string;
      shiftAllocations?: boolean;
    }): Promise<{ updatedIds: string[]; shiftedAllocations: number; dependentCount: number }> => {
      const [{ data: stages, error: sErr }, { data: deps, error: dErr }] = await Promise.all([
        supabase.from("pm_stages").select("id, start_date, end_date"),
        supabase.from("pm_stage_dependencies").select("*"),
      ]);
      if (sErr) throw sErr;
      if (dErr) throw dErr;

      // Snapshot every stage's pre-update bounds so we can compute per-stage
      // deltas after the cascade resolves. We need this for BOTH the moved
      // stage AND every cascaded successor — otherwise their allocations
      // dangle when stages slide forward in time.
      const beforeById = new Map<string, { start: string; end: string }>();
      for (const s of (stages ?? []) as { id: string; start_date: string; end_date: string }[]) {
        beforeById.set(s.id, { start: s.start_date, end: s.end_date });
      }

      const updates = computeCascade(
        id,
        start_date,
        end_date,
        stages ?? [],
        (deps ?? []) as unknown as StageDependency[],
      );

      for (const [stageId, bounds] of updates) {
        const { error } = await supabase
          .from("pm_stages")
          .update({ start_date: bounds.start_date, end_date: bounds.end_date })
          .eq("id", stageId);
        if (error) throw error;
      }

      // Shift allocations of EVERY moved stage (the user-edited one plus any
      // cascaded successors) by that stage's own start delta, so allocation
      // ranges follow their parent stage. Only pure-shift moves are applied
      // — if the user-edited stage was resized (start delta ≠ end delta),
      // we leave its allocations alone (caller handles resize manually) but
      // still shift cascaded successors (which always preserve duration).
      let shiftedAllocations = 0;
      if (shiftAllocations && updates.size > 0) {
        const stageDeltas = new Map<string, number>();
        for (const [stageId, bounds] of updates) {
          const before = beforeById.get(stageId);
          if (!before) continue;
          const oldStart = new Date(before.start).getTime();
          const oldEnd = new Date(before.end).getTime();
          const newStart = new Date(bounds.start_date).getTime();
          const newEnd = new Date(bounds.end_date).getTime();
          const startDelta = Math.round((newStart - oldStart) / 86_400_000);
          const endDelta = Math.round((newEnd - oldEnd) / 86_400_000);
          if (startDelta !== 0 && startDelta === endDelta) {
            stageDeltas.set(stageId, startDelta);
          }
        }

        if (stageDeltas.size > 0) {
          const { data: allocs, error: aErr } = await supabase
            .from("pm_allocations")
            .select("id, stage_id, start_date, end_date")
            .in("stage_id", Array.from(stageDeltas.keys()));
          if (aErr) throw aErr;
          const shiftDay = (iso: string, delta: number): string => {
            const d = new Date(iso);
            d.setDate(d.getDate() + delta);
            return d.toISOString().slice(0, 10);
          };
          for (const a of (allocs ?? []) as {
            id: string; stage_id: string; start_date: string; end_date: string;
          }[]) {
            const delta = stageDeltas.get(a.stage_id);
            if (!delta) continue;
            const { error } = await supabase
              .from("pm_allocations")
              .update({
                start_date: shiftDay(a.start_date, delta),
                end_date: shiftDay(a.end_date, delta),
              })
              .eq("id", a.id);
            if (error) throw error;
            shiftedAllocations += 1;
          }
        }
      }

      const updatedIds = Array.from(updates.keys());
      const dependentCount = updatedIds.filter((sid) => sid !== id).length;
      return { updatedIds, shiftedAllocations, dependentCount };
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
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}

// ---------- STAGE DEPENDENCIES ----------

async function cascadeProjectFromPredecessor(predecessorId: string) {
  const [{ data: stages, error: sErr }, { data: deps, error: dErr }] = await Promise.all([
    supabase.from("pm_stages").select("id, start_date, end_date"),
    supabase.from("pm_stage_dependencies").select("*"),
  ]);
  if (sErr) throw sErr;
  if (dErr) throw dErr;

  const pred = (stages ?? []).find((s) => s.id === predecessorId);
  if (!pred) return;

  const beforeById = new Map<string, { start: string; end: string }>();
  for (const s of (stages ?? []) as { id: string; start_date: string; end_date: string }[]) {
    beforeById.set(s.id, { start: s.start_date, end: s.end_date });
  }

  const updates = computeCascade(
    pred.id,
    pred.start_date,
    pred.end_date,
    stages ?? [],
    (deps ?? []) as unknown as StageDependency[],
  );

  for (const [stageId, bounds] of updates) {
    if (stageId === pred.id) continue;
    const before = beforeById.get(stageId);
    if (before?.start === bounds.start_date && before?.end === bounds.end_date) continue;
    const { error } = await supabase
      .from("pm_stages")
      .update({ start_date: bounds.start_date, end_date: bounds.end_date })
      .eq("id", stageId);
    if (error) throw error;
  }

  const stageDeltas = new Map<string, number>();
  for (const [stageId, bounds] of updates) {
    if (stageId === pred.id) continue;
    const before = beforeById.get(stageId);
    if (!before) continue;
    const startDelta = Math.round((new Date(bounds.start_date).getTime() - new Date(before.start).getTime()) / 86_400_000);
    const endDelta = Math.round((new Date(bounds.end_date).getTime() - new Date(before.end).getTime()) / 86_400_000);
    if (startDelta !== 0 && startDelta === endDelta) stageDeltas.set(stageId, startDelta);
  }

  if (stageDeltas.size === 0) return;
  const { data: allocs, error: aErr } = await supabase
    .from("pm_allocations")
    .select("id, stage_id, start_date, end_date")
    .in("stage_id", Array.from(stageDeltas.keys()));
  if (aErr) throw aErr;
  const shiftDay = (iso: string, delta: number): string => {
    const d = new Date(iso);
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
  };
  for (const a of (allocs ?? []) as { id: string; stage_id: string; start_date: string; end_date: string }[]) {
    const delta = stageDeltas.get(a.stage_id);
    if (!delta) continue;
    const { error } = await supabase
      .from("pm_allocations")
      .update({ start_date: shiftDay(a.start_date, delta), end_date: shiftDay(a.end_date, delta) })
      .eq("id", a.id);
    if (error) throw error;
  }
}

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
      const { data, error } = await supabase
        .from("pm_stage_dependencies")
        .insert({
          predecessor_id: input.predecessor_id,
          successor_id: input.successor_id,
          type: input.type ?? "FS",
          lag_days: input.lag_days ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      await cascadeProjectFromPredecessor(input.predecessor_id);
      return data as unknown as StageDependency;
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
      const { data, error } = await supabase
        .from("pm_stage_dependencies")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await cascadeProjectFromPredecessor((data as unknown as StageDependency).predecessor_id);
      return data as unknown as StageDependency;
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
      const { error } = await supabase.from("pm_stage_dependencies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-stage-dependencies"] }),
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
        .select("*, stage:pm_stages(*, project:pm_projects(*)), resource:pm_resources(*)");
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
    }): Promise<AllocationWithResource> => {
      const { projectId: _ignore, ...payload } = input;
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
      const { error } = await supabase.from("pm_allocations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm-project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm-allocations-all"] });
      qc.invalidateQueries({ queryKey: ["pm-stages-all"] });
    },
  });
}
