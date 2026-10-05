// Server function: estimated allocation for the caller's own assignments that
// carry no hours. Runs with elevated access because the estimate needs the
// stage's total logged hours (all people) and the team average sale rate
// (salary-derived). Only returns aggregated hours for the caller — never
// salaries or other people's entries.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Collaborator, Snapshot } from "@/lib/salary";
import { computeTeamPricingAverages, type TeamPricingBo } from "@/lib/quotes/use-team-pricing-averages";
import { estimateStageLoad, isImplicitAllocation, stagePlannedHours, type LoadAlloc } from "./stage-load-estimate";

export type MyStageEstimate = { stage_id: string; estimated: number };

export const getMyStageLoadEstimates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ stageIds: z.array(z.string().uuid()).max(300) }).parse(d))
  .handler(async ({ data, context }): Promise<MyStageEstimate[]> => {
    if (!data.stageIds.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await context.supabase.rpc("pm_get_my_resource_id" as never);
    const myRes = me as unknown as string | null;
    if (!myRes) return [];
    const { data: allocs, error: ae } = await supabaseAdmin
      .from("pm_allocations")
      .select("id, resource_id, stage_id, start_date, end_date, hours_per_day, allocation_percentage")
      .in("stage_id", data.stageIds);
    if (ae) throw ae;
    const all = (allocs ?? []) as (LoadAlloc & { id: string })[];
    // Only stages where the caller has an assignment without explicit hours.
    const target = [...new Set(all.filter((a) => a.resource_id === myRes && isImplicitAllocation(a)).map((a) => a.stage_id))];
    if (!target.length) return [];
    const today = new Date().toISOString().slice(0, 10);
    const [stagesRes, tasksRes, holRes, collabRes, snapRes, boRes, allCollabRes] = await Promise.all([
      supabaseAdmin.from("pm_stages").select("id, budget, start_date, end_date").in("id", target),
      supabaseAdmin.from("pm_tasks").select("id, allocation_id").in("allocation_id", all.filter((a) => target.includes(a.stage_id)).map((a) => a.id)),
      supabaseAdmin.from("holidays").select("data").gte("data", today),
      supabaseAdmin.from("collaborators").select("*").is("archived_at", null).eq("departamento", "Projecto"),
      supabaseAdmin.from("salary_snapshots").select("*").eq("is_effective", true),
      supabaseAdmin.from("bo_settings").select("*").limit(1).maybeSingle(),
      supabaseAdmin.from("collaborators").select("*").is("archived_at", null),
    ]);
    for (const r of [stagesRes, tasksRes, holRes, collabRes, snapRes, boRes, allCollabRes]) if (r.error) throw r.error;
    const avg = computeTeamPricingAverages({
      projecto: (collabRes.data ?? []) as Collaborator[],
      snapshots: (snapRes.data ?? []) as Snapshot[],
      bo: boRes.data as TeamPricingBo | null,
      allCollabs: (allCollabRes.data ?? []) as Collaborator[],
    }).avgSalePerHour;
    const allocStage = new Map(all.map((a) => [a.id, a.stage_id]));
    const taskStage = new Map<string, string>();
    for (const t of (tasksRes.data ?? []) as { id: string; allocation_id: string }[]) {
      const s = allocStage.get(t.allocation_id);
      if (s) taskStage.set(t.id, s);
    }
    const logged = new Map<string, number>();
    const mine = new Map<string, number>();
    const { data: myUser } = await context.supabase.auth.getUser();
    const taskIds = [...taskStage.keys()];
    for (let i = 0; i < taskIds.length; i += 200) {
      const { data: ents, error } = await supabaseAdmin
        .from("pm_time_entries")
        .select("task_id, hours, user_id")
        .in("task_id", taskIds.slice(i, i + 200));
      if (error) throw error;
      for (const e of ents ?? []) {
        const s = taskStage.get(e.task_id as string);
        if (!s) continue;
        logged.set(s, (logged.get(s) ?? 0) + Number(e.hours ?? 0));
        if (e.user_id === myUser.user?.id) mine.set(s, (mine.get(s) ?? 0) + Number(e.hours ?? 0));
      }
    }
    const holidays = new Set((holRes.data ?? []).map((h) => h.data as string));
    const out: MyStageEstimate[] = [];
    for (const s of (stagesRes.data ?? []) as { id: string; budget: number | null; start_date: string | null; end_date: string | null }[]) {
      const sa = all.filter((a) => a.stage_id === s.id);
      const est = estimateStageLoad({
        stageId: s.id,
        planned: stagePlannedHours({ allocations: sa, budget: s.budget, avgSaleRate: avg }),
        logged: logged.get(s.id) ?? 0,
        start: s.start_date, end: s.end_date, today, holidays, allocations: sa,
      });
      if (!est) continue;
      // Allocated (estimated) = what the person already logged + their share of what remains.
      out.push({ stage_id: s.id, estimated: Math.round(((mine.get(s.id) ?? 0) + est.perPerson) * 100) / 100 });
    }
    return out;
  });
