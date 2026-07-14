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
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  // Resolved:
  stage_id: string | null;
  stage_name: string | null;
  gantt_number: string | null;
  user_name: string | null;
}

interface StageRow {
  id: string;
  name: string;
  gantt_number: string | null;
  budget: number;
  hours_planned: number | null;
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
      // Fetch project stages so we can resolve stage via task_id or pm_stage_id.
      const { data: stagesRaw } = await supabase
        .from("pm_stages")
        .select("id, name, gantt_number, budget, hours_planned")
        .eq("project_id", projectId);
      const stages: Map<string, StageRow> = new Map(
        ((stagesRaw ?? []) as StageRow[]).map((s) => [s.id, s]),
      );
      const stageIds = Array.from(stages.keys());

      // Task -> stage lookup for task-based entries.
      const { data: allocs } = await supabase
        .from("pm_allocations")
        .select("stage_id, tasks:pm_tasks(id)")
        .in("stage_id", stageIds.length ? stageIds : ["00000000-0000-0000-0000-000000000000"]);
      const taskToStage = new Map<string, string>();
      for (const a of (allocs ?? []) as Array<{ stage_id: string; tasks: { id: string }[] }>) {
        for (const t of a.tasks ?? []) taskToStage.set(t.id, a.stage_id);
      }
      const taskIds = Array.from(taskToStage.keys());

      // Fetch pending entries that belong to this project (via stage or task).
      const orClauses: string[] = [];
      if (stageIds.length) orClauses.push(`pm_stage_id.in.(${stageIds.join(",")})`);
      if (taskIds.length) orClauses.push(`task_id.in.(${taskIds.join(",")})`);
      if (!orClauses.length) return { groups: [], total: 0 };

      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select(
          "id, user_id, entry_date, hours, billable, notes, task_id, pm_stage_id, cost_rate_snapshot, sale_rate_snapshot, sale_rate_override, approval_status, approved_by, approved_at, rejection_reason",
        )
        .eq("approval_status", "pending")
        .or(orClauses.join(","))
        .order("entry_date", { ascending: false });
      if (error) throw error;

      // Resolve user names via collaborators.
      const userIds = Array.from(new Set((entries ?? []).map((e) => e.user_id)));
      const userNames = new Map<string, string>();
      if (userIds.length) {
        const { data: cols } = await supabase
          .from("collaborators")
          .select("user_id, full_name")
          .in("user_id", userIds);
        for (const c of (cols ?? []) as Array<{ user_id: string; full_name: string }>) {
          userNames.set(c.user_id, c.full_name);
        }
      }

      const enriched: PendingEntry[] = (entries ?? []).map((e) => {
        const stageId =
          e.pm_stage_id ?? (e.task_id ? taskToStage.get(e.task_id) ?? null : null);
        const stage = stageId ? stages.get(stageId) ?? null : null;
        return {
          ...(e as Omit<PendingEntry, "stage_id" | "stage_name" | "gantt_number" | "user_name">),
          stage_id: stageId,
          stage_name: stage?.name ?? null,
          gantt_number: stage?.gantt_number ?? null,
          user_name: userNames.get(e.user_id) ?? null,
        };
      });

      // Group by stage.
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
        const h = Number(e.hours) || 0;
        g.totalHours += h;
        if (e.billable) {
          g.billableHours += h;
          const rate = Number(e.sale_rate_override ?? e.sale_rate_snapshot ?? 0);
          g.billableAmount += h * rate;
        }
      }
      const groups = Array.from(groupMap.values()).sort((a, b) =>
        (a.stage?.gantt_number ?? "zzz").localeCompare(b.stage?.gantt_number ?? "zzz"),
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
      const patch: Record<string, unknown> = {
        approval_status: "approved",
        approved_at: new Date().toISOString(),
      };
      if (typeof input.billable === "boolean") patch.billable = input.billable;
      if (input.sale_rate_override !== undefined)
        patch.sale_rate_override = input.sale_rate_override;
      if (input.pm_stage_id !== undefined) {
        patch.pm_stage_id = input.pm_stage_id;
        // If moving to a stage, clear task_id so the entry lives directly on the stage.
        if (input.pm_stage_id) patch.task_id = null;
      }
      const { data: user } = await supabase.auth.getUser();
      if (user.user?.id) patch.approved_by = user.user.id;
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
          approval_status: "rejected",
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
      // Get pending entries with a resolvable project via stage.
      const { data: entries, error } = await supabase
        .from("pm_time_entries")
        .select("id, hours, pm_stage_id, task_id")
        .eq("approval_status", "pending");
      if (error) throw error;

      const stageIds = Array.from(
        new Set((entries ?? []).map((e) => e.pm_stage_id).filter(Boolean) as string[]),
      );
      const taskIds = Array.from(
        new Set((entries ?? []).map((e) => e.task_id).filter(Boolean) as string[]),
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
        for (const row of (data ?? []) as Array<{
          id: string;
          allocation: { stage: { project_id: string } | null } | null;
        }>) {
          const pid = row.allocation?.stage?.project_id;
          if (pid) taskProject.set(row.id, pid);
        }
      }

      const byProject = new Map<string, { count: number; hours: number }>();
      for (const e of entries ?? []) {
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
      if (!projectIds.length) return [];
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
