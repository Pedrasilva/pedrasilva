/**
 * Monthly rollup of actuals logged against a fee-only retainer stage.
 *
 * Reads `pm_time_entries` where entry_type='retainer' and quote_stage_id
 * matches. Cost/sale rates come from snapshots persisted at log time
 * (cost_rate_snapshot / sale_rate_snapshot) so retainer readings are stable
 * even when resource rates change later.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RetainerMonthBucket {
  month: string; // YYYY-MM
  fee: number;
  hours: number;
  billableHours: number;
  cost: number;
  value: number;
  marginDelta: number; // fee - cost  (positive = under budget)
  deliveryDelta: number; // value - fee (positive = delivering more value than charged)
  isOverflow: boolean; // month outside the retainer span
}

export interface RetainerMonthlyEntry {
  id: string;
  entry_date: string;
  hours: number;
  billable: boolean;
  notes: string | null;
  user_id: string;
  cost_rate: number;
  sale_rate: number;
}

export interface RetainerMonthlyActuals {
  months: RetainerMonthBucket[];
  entries: RetainerMonthlyEntry[];
  totals: {
    fee: number;
    hours: number;
    cost: number;
    value: number;
    marginDelta: number;
    deliveryDelta: number;
  };
}

function ym(iso: string): string {
  return iso.slice(0, 7);
}

function addMonths(anchorYm: string, n: number): string {
  const [y, m] = anchorYm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function useRetainerMonthlyActuals(args: {
  stageId: string;
  anchorMonth: string;
  months: number;
  monthlyFee: number;
}) {
  const { stageId, anchorMonth, months, monthlyFee } = args;

  return useQuery({
    queryKey: ["retainer-monthly-actuals", stageId, anchorMonth, months, monthlyFee],
    enabled: !!stageId,
    queryFn: async (): Promise<RetainerMonthlyActuals> => {
      type RawEntry = {
        id: string;
        entry_date: string;
        hours: number | string;
        billable: boolean;
        notes: string | null;
        user_id: string;
        cost_rate_snapshot: number | string | null;
        sale_rate_snapshot: number | string | null;
      };
      const SELECT =
        "id, entry_date, hours, billable, notes, user_id, cost_rate_snapshot, sale_rate_snapshot";

      // Hours reach a retainer stage through three different shapes, and
      // matching on entry_type='retainer' only ever caught the first one:
      //   1. quote-side inline logging  → quote_stage_id = this stage
      //   2. project-side open logging  → pm_stage_id = mirrored pm_stage
      //   3. normal timesheet logging   → task → allocation → pm_stage
      // Match by stage association regardless of entry_type.
      const { data: pmStageRows } = await supabase
        .from("pm_stages")
        .select("id")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("source_quote_stage_id" as any, stageId);
      const parentIds = ((pmStageRows ?? []) as Array<{ id: string }>).map((r) => r.id);
      let pmStageIds = [...parentIds];
      if (parentIds.length > 0) {
        const { data: childRows } = await supabase
          .from("pm_stages")
          .select("id")
          .in("parent_stage_id", parentIds);
        pmStageIds = pmStageIds.concat(
          ((childRows ?? []) as Array<{ id: string }>).map((r) => r.id),
        );
      }

      const queries: Array<PromiseLike<{ data: unknown; error: unknown }>> = [
        supabase
          .from("pm_time_entries")
          .select(SELECT)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq("quote_stage_id" as any, stageId),
      ];
      if (pmStageIds.length > 0) {
        queries.push(
          supabase.from("pm_time_entries").select(SELECT).in("pm_stage_id", pmStageIds),
          supabase
            .from("pm_time_entries")
            .select(`${SELECT}, pm_tasks!inner(pm_allocations!inner(stage_id))`)
            .in("pm_tasks.pm_allocations.stage_id", pmStageIds)
            .not("task_id", "is", null),
        );
      }

      const results = await Promise.all(queries);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const byId = new Map<string, RawEntry>();
      for (const r of results) {
        for (const row of ((r.data ?? []) as RawEntry[])) byId.set(row.id, row);
      }
      const rawEntries = Array.from(byId.values()).sort((a, b) =>
        a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : 0,
      );

      const entries: RetainerMonthlyEntry[] = rawEntries.map((e) => ({
        id: e.id,
        entry_date: e.entry_date,
        hours: Number(e.hours),
        billable: !!e.billable,
        notes: e.notes,
        user_id: e.user_id,
        cost_rate: Number(e.cost_rate_snapshot ?? 0),
        sale_rate: Number(e.sale_rate_snapshot ?? 0),
      }));

      // Seed month buckets. Even split with remainder on the last month
      // (mirrors the payment generator).
      const baseYm = anchorMonth.slice(0, 7);
      const safeMonths = Math.max(1, months);
      const cents = Math.round(Number(monthlyFee || 0) * safeMonths * 100);
      const baseCents = Math.floor(cents / safeMonths);
      const remainder = cents - baseCents * safeMonths;

      const buckets = new Map<string, RetainerMonthBucket>();
      for (let i = 0; i < safeMonths; i++) {
        const m = addMonths(baseYm, i);
        const feeCents = baseCents + (i === safeMonths - 1 ? remainder : 0);
        const fee = feeCents / 100;
        buckets.set(m, {
          month: m,
          fee,
          hours: 0,
          billableHours: 0,
          cost: 0,
          value: 0,
          marginDelta: fee,
          deliveryDelta: -fee,
          isOverflow: false,
        });
      }

      for (const e of entries) {
        const key = ym(e.entry_date);
        let b = buckets.get(key);
        if (!b) {
          b = {
            month: key,
            fee: 0,
            hours: 0,
            billableHours: 0,
            cost: 0,
            value: 0,
            marginDelta: 0,
            deliveryDelta: 0,
            isOverflow: true,
          };
          buckets.set(key, b);
        }
        b.hours += e.hours;
        if (e.billable) b.billableHours += e.hours;
        b.cost += e.hours * e.cost_rate;
        b.value += (e.billable ? e.hours : 0) * e.sale_rate;
        b.marginDelta = b.fee - b.cost;
        b.deliveryDelta = b.value - b.fee;
      }

      const sortedMonths = Array.from(buckets.values()).sort((a, b) =>
        a.month < b.month ? -1 : a.month > b.month ? 1 : 0,
      );

      const totals = sortedMonths.reduce(
        (acc, b) => {
          acc.fee += b.fee;
          acc.hours += b.hours;
          acc.cost += b.cost;
          acc.value += b.value;
          return acc;
        },
        { fee: 0, hours: 0, cost: 0, value: 0, marginDelta: 0, deliveryDelta: 0 },
      );
      totals.marginDelta = totals.fee - totals.cost;
      totals.deliveryDelta = totals.value - totals.fee;

      return { months: sortedMonths, entries, totals };
    },
  });
}
