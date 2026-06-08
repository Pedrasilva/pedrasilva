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
      const { data: rawEntries, error } = await supabase
        .from("pm_time_entries")
        .select(
          "id, entry_date, hours, billable, notes, user_id, cost_rate_snapshot, sale_rate_snapshot",
        )
        .eq("entry_type", "retainer" as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("quote_stage_id" as any, stageId)
        .order("entry_date", { ascending: true });
      if (error) throw error;

      const entries: RetainerMonthlyEntry[] = (
        (rawEntries ?? []) as Array<{
          id: string;
          entry_date: string;
          hours: number | string;
          billable: boolean;
          notes: string | null;
          user_id: string;
          cost_rate_snapshot: number | string | null;
          sale_rate_snapshot: number | string | null;
        }>
      ).map((e) => ({
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
