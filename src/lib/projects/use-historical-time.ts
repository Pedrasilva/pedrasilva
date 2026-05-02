// Aggregates of imported historical time entries (e.g. Accelo) per project.
//
// These rows are NEVER mixed into stage/task-level breakdowns or editable
// weekly timesheets — they have no allocation / task linkage. Instead we
// expose project-level totals so labour cost & performance dashboards can
// surface imported actuals on top of live `pm_time_entries`.
//
// Idempotency is enforced at write time via UNIQUE (source_system, external_id)
// on `historical_time_entries`, so summing rows here cannot double count
// re-imports of the same source row.
//
// Live timesheet entries are NOT mirrored into historical_time_entries (the
// importer only writes from external source_systems), so summing both sources
// per project_id cannot double-count the same logged hour.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HistoricalProjectTotals {
  loggedHours: number;
  billableHours: number;
  nonBillableHours: number;
  cost: number;
  amount: number; // billable value as recorded by the source system
  rowCount: number;
  sources: string[]; // distinct source_system values contributing
}

const EMPTY: HistoricalProjectTotals = {
  loggedHours: 0,
  billableHours: 0,
  nonBillableHours: 0,
  cost: 0,
  amount: 0,
  rowCount: 0,
  sources: [],
};

function aggregate(
  rows: Array<{
    source_system: string;
    billable_hours: number | string | null;
    non_billable_hours: number | string | null;
    cost: number | string | null;
    amount: number | string | null;
  }>,
): HistoricalProjectTotals {
  const sources = new Set<string>();
  let billable = 0;
  let nonBillable = 0;
  let cost = 0;
  let amount = 0;
  for (const r of rows) {
    sources.add(r.source_system);
    billable += Number(r.billable_hours ?? 0);
    nonBillable += Number(r.non_billable_hours ?? 0);
    cost += Number(r.cost ?? 0);
    amount += Number(r.amount ?? 0);
  }
  return {
    loggedHours: billable + nonBillable,
    billableHours: billable,
    nonBillableHours: nonBillable,
    cost,
    amount,
    rowCount: rows.length,
    sources: Array.from(sources),
  };
}

/** Per-project aggregate for ONE project. */
export function useHistoricalProjectTotals(projectId: string | undefined) {
  return useQuery({
    queryKey: ["historical-time-totals", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<HistoricalProjectTotals> => {
      const { data, error } = await supabase
        .from("historical_time_entries")
        .select("source_system, billable_hours, non_billable_hours, cost, amount")
        .eq("project_id", projectId!);
      if (error) throw error;
      return aggregate(data ?? []);
    },
  });
}

/** Per-project map across ALL projects — for list/dashboard views. */
export function useHistoricalProjectTotalsMap() {
  return useQuery({
    queryKey: ["historical-time-totals-map"],
    queryFn: async (): Promise<Map<string, HistoricalProjectTotals>> => {
      const { data, error } = await supabase
        .from("historical_time_entries")
        .select("project_id, source_system, billable_hours, non_billable_hours, cost, amount")
        .not("project_id", "is", null);
      if (error) throw error;
      const byProject = new Map<string, typeof data>();
      for (const r of data ?? []) {
        if (!r.project_id) continue;
        const arr = byProject.get(r.project_id) ?? [];
        arr.push(r);
        byProject.set(r.project_id, arr);
      }
      const out = new Map<string, HistoricalProjectTotals>();
      byProject.forEach((rows, pid) => out.set(pid, aggregate(rows ?? [])));
      return out;
    },
  });
}

export const EMPTY_HISTORICAL_TOTALS = EMPTY;
