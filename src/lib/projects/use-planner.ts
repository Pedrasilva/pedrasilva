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
    queryKey: ["pm_projects"],
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
      const { data, error } = await supabase
        .from("pm_projects")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_projects"] }),
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
      qc.invalidateQueries({ queryKey: ["pm_projects"] });
      qc.invalidateQueries({ queryKey: ["pm_project", vars.id] });
    },
  });
}

// ---------- PROJECT DETAIL ----------

export function useProjectDetail(projectId: string) {
  return useQuery({
    queryKey: ["pm_project", projectId],
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
    queryKey: ["pm_stages-all"],
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
      qc.invalidateQueries({ queryKey: ["pm_project", vars.project_id] });
      qc.invalidateQueries({ queryKey: ["pm_stages-all"] });
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
      qc.invalidateQueries({ queryKey: ["pm_project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm_stages-all"] });
    },
  });
}

export function useUpdateStageWithCascade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      start_date,
      end_date,
    }: {
      id: string;
      start_date: string;
      end_date: string;
      projectId: string;
    }): Promise<{ updatedIds: string[] }> => {
      const [{ data: stages, error: sErr }, { data: deps, error: dErr }] = await Promise.all([
        supabase.from("pm_stages").select("id, start_date, end_date"),
        supabase.from("pm_stage_dependencies").select("*"),
      ]);
      if (sErr) throw sErr;
      if (dErr) throw dErr;

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
      return { updatedIds: Array.from(updates.keys()) };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm_project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm_stages-all"] });
      qc.invalidateQueries({ queryKey: ["pm_stage-dependencies"] });
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
      qc.invalidateQueries({ queryKey: ["pm_project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm_stages-all"] });
    },
  });
}

// ---------- DEPENDENCIES ----------

export function useStageDependencies() {
  return useQuery({
    queryKey: ["pm_stage-dependencies"],
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
      return data as unknown as StageDependency;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_stage-dependencies"] }),
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
      return data as unknown as StageDependency;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_stage-dependencies"] }),
  });
}

export function useDeleteDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_stage_dependencies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_stage-dependencies"] }),
  });
}

// ---------- RESOURCES ----------

export function useResources() {
  return useQuery({
    queryKey: ["pm_resources"],
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
  weekly_capacity: number;
  color?: string;
  team?: ResourceTeam;
  phone?: string | null;
  notes?: string | null;
  collaborator_id?: string | null;
};

export function useCreateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ResourceInput): Promise<Resource> => {
      const { data, error } = await supabase
        .from("pm_resources")
        .insert(input as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_resources"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_resources"] }),
  });
}

export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm_resources"] }),
  });
}

// ---------- ALLOCATIONS ----------

export type AllocationFull = Allocation & {
  stage: Stage & { project: Project };
  resource: Resource;
};

export function useAllAllocations() {
  return useQuery({
    queryKey: ["pm_allocations-all"],
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
      qc.invalidateQueries({ queryKey: ["pm_project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm_allocations-all"] });
      qc.invalidateQueries({ queryKey: ["pm_stages-all"] });
    },
  });
}

export function useUpdateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<Allocation, "start_date" | "end_date" | "hours_per_day" | "stage_id">>;
      projectId: string;
    }): Promise<Allocation> => {
      const { data, error } = await supabase
        .from("pm_allocations")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pm_project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm_allocations-all"] });
      qc.invalidateQueries({ queryKey: ["pm_stages-all"] });
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
      qc.invalidateQueries({ queryKey: ["pm_project", vars.projectId] });
      qc.invalidateQueries({ queryKey: ["pm_allocations-all"] });
      qc.invalidateQueries({ queryKey: ["pm_stages-all"] });
    },
  });
}
