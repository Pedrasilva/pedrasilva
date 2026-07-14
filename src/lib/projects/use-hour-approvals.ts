/**
 * Hour approval workflow — pending time entries visible to admins /
 * projects.all permission holders. Approvers can toggle billable,
 * override sale rate, reassign stage, and approve or reject.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface PendingEntry {
  id: string;
  user_id: string;
  entry_date: string;
  hours: number;
  billable: boolean;
  notes: string | null;
  task_id: string | null;
  pm_stage_id: string | null;
  cost_rate_snapshot: number | null;
  sale_rate_snapshot: number | null;
  sale_rate_override: number | null;
  approval_status: ApprovalStatus;
  stage_id: string | null;
  stage_name: string | null;
  stage_number: string | null;
  user_name: string | null;
}

interface StageRow {
  id: string;
  name: string;
  budget: number;
  sort_order: number;
}

export interface ApprovalGroup {
  stage: StageRow | null;
  entries: PendingEntry[];
  totalHours: number;
  billableHours: number;
  billableAmount: number;
}

export function useProjectPendingHours(projectId: string) {
  return useQuery({
    queryKey: ["hour-approvals", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<{ groups: ApprovalGroup[]; total: number }> => {
      const { data: stagesRaw } = await supabase
        .from("pm_stages")
        .select("id, name, budget, sort_order")
        .eq("project_id", projectId);
      const stages = new Map<string, StageRow>(
        ((stagesRaw ?? []) as unknown as StageRow[]).map((s) => [s.id, s]),
      );
      const stageIds = Array.from(stages.keys());
      if (!stageIds.length) return { groups: [], total: 0 };

      // Task -> stage lookup.
      const { data: allocs } = await supabase
        .from("pm_allocations")
        .select("stage_id, tasks:pm_tasks(id)")
        .in("stage_id", stageIds);
      const taskToStage = new Map<string, string>();
      for (const a of (allocs ?? []) as unknown as Array<{
        stage_id: string;
        tasks: { id: string }[] | null;
      }>) {
        for (const t of a.tasks ?? []) taskToStage.set(t.id, a.stage_id);
      }
      const taskIds = Array.from(taskToStage.keys());

      const orClauses: string[] = [`pm_stage_id.in.(${stageIds.join(",")})`];
      if (taskIds.length) orClauses.push(`task_id.in.(${taskIds.join(",")})`);

      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select(
          "id, user_id, entry_date, hours, billable, notes, task_id, pm_stage_id, cost_rate_snapshot, sale_rate_snapshot, sale_rate_override, approval_status",
        )
        .eq("approval_status", "pending")
        .or(orClauses.join(","))
        .order("entry_date", { ascending: false });
      if (error) throw error;

      // Resolve user names via pm_resource_map_for_users RPC (same pattern used elsewhere).
      const userIds = Array.from(new Set((entries ?? []).map((e) => e.user_id)));
      const userNames = new Map<string, string>();
      if (userIds.length) {
        const { data: mapRows } = await supabase.rpc("pm_resource_map_for_users", {
          _user_ids: userIds,
        });
        for (const m of (mapRows ?? []) as Array<{ user_id: string; name: string | null }>) {
          if (m.name) userNames.set(m.user_id, m.name);
        }
      }

      const enriched: PendingEntry[] = ((entries ?? []) as Array<{
        id: string;
        user_id: string;
        entry_date: string;
        hours: number | string;
        billable: boolean;
        notes: string | null;
        task_id: string | null;
        pm_stage_id: string | null;
        cost_rate_snapshot: number | string | null;
        sale_rate_snapshot: number | string | null;
        sale_rate_override: number | string | null;
        approval_status: ApprovalStatus;
      }>).map((e) => {
        const stageId =
          e.pm_stage_id ?? (e.task_id ? taskToStage.get(e.task_id) ?? null : null);
        const stage = stageId ? stages.get(stageId) ?? null : null;
        return {
          id: e.id,
          user_id: e.user_id,
          entry_date: e.entry_date,
          hours: Number(e.hours),
          billable: e.billable,
          notes: e.notes,
          task_id: e.task_id,
          pm_stage_id: e.pm_stage_id,
          cost_rate_snapshot: e.cost_rate_snapshot != null ? Number(e.cost_rate_snapshot) : null,
          sale_rate_snapshot: e.sale_rate_snapshot != null ? Number(e.sale_rate_snapshot) : null,
          sale_rate_override: e.sale_rate_override != null ? Number(e.sale_rate_override) : null,
          approval_status: e.approval_status,
          stage_id: stageId,
          stage_name: stage?.name ?? null,
          stage_number: stage ? String(stage.sort_order + 1) : null,
          user_name: userNames.get(e.user_id) ?? null,
        };
      });

      const groupMap = new Map<string, ApprovalGroup>();
      for (const e of enriched) {
        const key = e.stage_id ?? "__unassigned__";
        let g = groupMap.get(key);
        if (!g) {
          g = {
            stage: e.stage_id ? stages.get(e.stage_id) ?? null : null,
            entries: [],
            totalHours: 0,
            billableHours: 0,
            billableAmount: 0,
          };
          groupMap.set(key, g);
        }
        g.entries.push(e);
        g.totalHours += e.hours;
        if (e.billable) {
          g.billableHours += e.hours;
          const rate = Number(e.sale_rate_override ?? e.sale_rate_snapshot ?? 0);
          g.billableAmount += e.hours * rate;
        }
      }
      const groups = Array.from(groupMap.values()).sort(
        (a, b) => (a.stage?.sort_order ?? 9999) - (b.stage?.sort_order ?? 9999),
      );
      return { groups, total: enriched.length };
    },
  });
}

export interface ApproveInput {
  id: string;
  billable?: boolean;
  sale_rate_override?: number | null;
  pm_stage_id?: string | null;
}

export function useApproveEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApproveInput) => {
      const { data: user } = await supabase.auth.getUser();
      const patch = {
        approval_status: "approved" as const,
        approved_at: new Date().toISOString(),
        approved_by: user.user?.id ?? null,
        ...(typeof input.billable === "boolean" ? { billable: input.billable } : {}),
        ...(input.sale_rate_override !== undefined
          ? { sale_rate_override: input.sale_rate_override }
          : {}),
        ...(input.pm_stage_id !== undefined
          ? { pm_stage_id: input.pm_stage_id, ...(input.pm_stage_id ? { task_id: null } : {}) }
          : {}),
      };
      const { error } = await supabase
        .from("pm_time_entries")
        .update(patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hour-approvals", projectId] });
      qc.invalidateQueries({ queryKey: ["pm-project-insights", projectId] });
      qc.invalidateQueries({ queryKey: ["retainer-monthly-actuals"] });
      qc.invalidateQueries({ queryKey: ["pending-approvals-summary"] });
    },
  });
}

export function useRejectEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pm_time_entries")
        .update({
          approval_status: "rejected" as const,
          rejection_reason: input.reason,
          approved_at: new Date().toISOString(),
          approved_by: user.user?.id ?? null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hour-approvals", projectId] });
      qc.invalidateQueries({ queryKey: ["pending-approvals-summary"] });
    },
  });
}

/** Cross-project queue: pending counts per project. */
export function usePendingApprovalsSummary() {
  return useQuery({
    queryKey: ["pending-approvals-summary"],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select("id, hours, pm_stage_id, task_id")
        .eq("approval_status", "pending");
      if (error) throw error;

      const rows = (entries ?? []) as Array<{
        id: string;
        hours: number | string;
        pm_stage_id: string | null;
        task_id: string | null;
      }>;

      const stageIds = Array.from(
        new Set(rows.map((e) => e.pm_stage_id).filter((v): v is string => !!v)),
      );
      const taskIds = Array.from(
        new Set(rows.map((e) => e.task_id).filter((v): v is string => !!v)),
      );

      const stageProject = new Map<string, string>();
      if (stageIds.length) {
        const { data } = await supabase
          .from("pm_stages")
          .select("id, project_id")
          .in("id", stageIds);
        for (const s of (data ?? []) as Array<{ id: string; project_id: string }>) {
          stageProject.set(s.id, s.project_id);
        }
      }
      const taskProject = new Map<string, string>();
      if (taskIds.length) {
        const { data } = await supabase
          .from("pm_tasks")
          .select("id, allocation:pm_allocations(stage:pm_stages(project_id))")
          .in("id", taskIds);
        for (const row of (data ?? []) as unknown as Array<{
          id: string;
          allocation: { stage: { project_id: string } | null } | null;
        }>) {
          const pid = row.allocation?.stage?.project_id;
          if (pid) taskProject.set(row.id, pid);
        }
      }

      const byProject = new Map<string, { count: number; hours: number }>();
      for (const e of rows) {
        const pid =
          (e.pm_stage_id ? stageProject.get(e.pm_stage_id) : null) ??
          (e.task_id ? taskProject.get(e.task_id) : null);
        if (!pid) continue;
        const cur = byProject.get(pid) ?? { count: 0, hours: 0 };
        cur.count += 1;
        cur.hours += Number(e.hours) || 0;
        byProject.set(pid, cur);
      }

      const projectIds = Array.from(byProject.keys());
      if (!projectIds.length) return [] as Array<{
        id: string;
        name: string;
        color: string;
        count: number;
        hours: number;
      }>;
      const { data: projects } = await supabase
        .from("pm_projects")
        .select("id, name, color")
        .in("id", projectIds);
      return ((projects ?? []) as Array<{ id: string; name: string; color: string }>)
        .map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          count: byProject.get(p.id)!.count,
          hours: byProject.get(p.id)!.hours,
        }))
        .sort((a, b) => b.count - a.count);
    },
  });
}
