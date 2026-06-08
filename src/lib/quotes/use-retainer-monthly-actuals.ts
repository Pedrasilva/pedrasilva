/**
 * Monthly rollup of actuals logged against a fee-only retainer stage.
 *
 * Reads `pm_time_entries` where entry_type='retainer' and quote_stage_id
 * matches, then joins each logger's user_id → collaborator → pm_resource to
 * pull current cost_rate / hourly_rate (sale). Buckets by YYYY-MM.
 *
 * Note: rates are taken from the resource AT READ TIME, not snapshotted at
 * log time. Good enough for v1 retainer readings; we can add a snapshot
 * later if rates churn mid-retainer.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RetainerMonthBucket {
  month: string; // YYYY-MM
  fee: number; // monthly fee for this row
  hours: number;
  billableHours: number;
  cost: number;
  value: number;
  marginDelta: number; // fee - cost
  deliveryDelta: number; // value - fee
}

export interface RetainerMonthlyEntry {
  id: string;
  entry_date: string;
  hours: number;
  billable: boolean;
  user_id: string;
  user_name: string | null;
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
  anchorMonth: string; // 'YYYY-MM-DD' or 'YYYY-MM'
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
        .select("id, entry_date, hours, billable, user_id")
        .eq("entry_type", "retainer" as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("quote_stage_id" as any, stageId)
        .order("entry_date", { ascending: true });
      if (error) throw error;

      const entryRows = (rawEntries ?? []) as Array<{
        id: string;
        entry_date: string;
        hours: number | string;
        billable: boolean;
        user_id: string;
      }>;

      // Build user_id → { resource, name } map by joining collaborators + resources.
      const userIds = Array.from(new Set(entryRows.map((e) => e.user_id)));
      const userInfo = new Map<
        string,
        { cost: number; sale: number; name: string | null }
      >();

      if (userIds.length > 0) {
        const { data: collabs } = await supabase
          .from("collaborators")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("user_id, nome_completo, resource:pm_resources(hourly_rate, cost_rate)" as any)
          .in("user_id", userIds);

        type CollabRow = {
          user_id: string;
          nome_completo: string | null;
          resource:
            | { hourly_rate: number | string | null; cost_rate: number | string | null }
            | Array<{ hourly_rate: number | string | null; cost_rate: number | string | null }>
            | null;
        };
        for (const c of (collabs ?? []) as unknown as CollabRow[]) {
          const r = Array.isArray(c.resource) ? c.resource[0] : c.resource;
          userInfo.set(c.user_id, {
            cost: Number(r?.cost_rate ?? 0),
            sale: Number(r?.hourly_rate ?? 0),
            name: c.nome_completo,
          });
        }
      }

      const entries: RetainerMonthlyEntry[] = entryRows.map((e) => {
        const info = userInfo.get(e.user_id);
        return {
          id: e.id,
          entry_date: e.entry_date,
          hours: Number(e.hours),
          billable: !!e.billable,
          user_id: e.user_id,
          user_name: info?.name ?? null,
          cost_rate: info?.cost ?? 0,
          sale_rate: info?.sale ?? 0,
        };
      });

      // Seed month buckets — anchor → +months-1.
      const baseYm = anchorMonth.slice(0, 7);
      const buckets = new Map<string, RetainerMonthBucket>();
      // Even split with remainder on the last month (mirrors payment generator).
      const cents = Math.round(Number(monthlyFee || 0) * months * 100);
      const baseCents = Math.floor(cents / Math.max(1, months));
      const remainder = cents - baseCents * Math.max(1, months);

      for (let i = 0; i < Math.max(1, months); i++) {
        const m = addMonths(baseYm, i);
        const feeCents = baseCents + (i === months - 1 ? remainder : 0);
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
        });
      }

      // Fold entries into buckets (entries outside the retainer span still
      // show up as overflow buckets so logged time isn't lost).
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
