/**
 * Variance between the immutable contract baseline (snapshot at quote→project
 * conversion) and the live project plan (pm_stages today). Read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useContractBaseline } from "@/lib/projects/use-contract-baseline";

type LiveStage = {
  id: string;
  name: string;
  parent_stage_id: string | null;
  start_date: string;
  end_date: string;
  budget: number | string | null;
  status: string | null;
};

export type StageVarianceRow = {
  key: string;
  name: string;
  parentName: string | null;
  // baseline
  baselineStart: string | null;
  baselineEnd: string | null;
  baselineBudget: number | null;
  // live
  liveStart: string | null;
  liveEnd: string | null;
  liveBudget: number | null;
  liveStatus: string | null;
  // derived
  startDeltaDays: number | null;
  endDeltaDays: number | null;
  budgetDelta: number | null;
  state: "unchanged" | "shifted" | "rebudgeted" | "added" | "removed" | "cancelled";
};

const dayDiff = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null;
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / 86_400_000);
};

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function useContractVariance(projectId: string | undefined) {
  const baseline = useContractBaseline(projectId);

  const live = useQuery({
    queryKey: ["pm-live-stages-variance", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<LiveStage[]> => {
      const { data, error } = await supabase
        .from("pm_stages")
        .select("id,name,parent_stage_id,start_date,end_date,budget,status")
        .eq("project_id", projectId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as LiveStage[];
    },
  });

  const isLoading = baseline.isLoading || live.isLoading;
  const rows: StageVarianceRow[] = [];

  if (baseline.data && live.data) {
    const liveById = new Map(live.data.map((s) => [s.id, s]));
    const liveIndex = new Map<string, LiveStage>();
    for (const s of live.data) {
      const parent = s.parent_stage_id ? liveById.get(s.parent_stage_id) ?? null : null;
      const key = `${norm(parent?.name ?? null)}|${norm(s.name)}`;
      liveIndex.set(key, s);
    }

    const seen = new Set<string>();
    for (const b of baseline.data.stages) {
      const key = `${norm(b.parent_name)}|${norm(b.name)}`;
      seen.add(key);
      const l = liveIndex.get(key);
      const baselineBudget = b.budget == null ? null : Number(b.budget);
      if (!l) {
        rows.push({
          key,
          name: b.name,
          parentName: b.parent_name,
          baselineStart: b.start_date,
          baselineEnd: b.end_date,
          baselineBudget,
          liveStart: null,
          liveEnd: null,
          liveBudget: null,
          liveStatus: null,
          startDeltaDays: null,
          endDeltaDays: null,
          budgetDelta: null,
          state: "removed",
        });
        continue;
      }
      const liveBudget = l.budget == null ? null : Number(l.budget);
      const startDelta = dayDiff(l.start_date, b.start_date);
      const endDelta = dayDiff(l.end_date, b.end_date);
      const budgetDelta =
        baselineBudget != null && liveBudget != null
          ? liveBudget - baselineBudget
          : null;
      const cancelled =
        (l.status ?? "").toLowerCase() === "cancelled" ||
        (l.status ?? "").toLowerCase() === "canceled";
      let state: StageVarianceRow["state"] = "unchanged";
      if (cancelled) state = "cancelled";
      else if (budgetDelta != null && Math.abs(budgetDelta) > 0.5) state = "rebudgeted";
      else if ((startDelta ?? 0) !== 0 || (endDelta ?? 0) !== 0) state = "shifted";
      rows.push({
        key,
        name: b.name,
        parentName: b.parent_name,
        baselineStart: b.start_date,
        baselineEnd: b.end_date,
        baselineBudget,
        liveStart: l.start_date,
        liveEnd: l.end_date,
        liveBudget,
        liveStatus: l.status,
        startDeltaDays: startDelta,
        endDeltaDays: endDelta,
        budgetDelta,
        state,
      });
    }

    // Added (live stages with no baseline twin).
    for (const s of live.data) {
      const parent = s.parent_stage_id ? liveById.get(s.parent_stage_id) ?? null : null;
      const key = `${norm(parent?.name ?? null)}|${norm(s.name)}`;
      if (seen.has(key)) continue;
      rows.push({
        key,
        name: s.name,
        parentName: parent?.name ?? null,
        baselineStart: null,
        baselineEnd: null,
        baselineBudget: null,
        liveStart: s.start_date,
        liveEnd: s.end_date,
        liveBudget: s.budget == null ? null : Number(s.budget),
        liveStatus: s.status,
        startDeltaDays: null,
        endDeltaDays: null,
        budgetDelta: null,
        state: "added",
      });
    }
  }

  // Totals
  const totals = rows.reduce(
    (acc, r) => {
      if (r.baselineBudget != null) acc.baseline += r.baselineBudget;
      if (r.liveBudget != null && r.state !== "cancelled") acc.live += r.liveBudget;
      return acc;
    },
    { baseline: 0, live: 0 },
  );

  return {
    isLoading,
    hasBaseline: !!baseline.data,
    rows,
    totals: { ...totals, delta: totals.live - totals.baseline },
  };
}
