/**
 * Single source of truth for bank balances.
 *
 * A bank account's balance is NOT the last manually entered snapshot. It is:
 *
 *   calculated_balance = opening_balance
 *                      + SUM(amount) of every RECONCILED transaction dated
 *                        after opening_balance_date (and up to `asOf`)
 *
 * The sum is computed in the database by `bank_calculated_balances(_as_of)`
 * so Bank balances, the Finance overview card and the cash-flow forecast all
 * read exactly the same number.
 *
 * Manual snapshots (`bank_balance_snapshots`) are an AUDIT CHECK: they are
 * compared against the calculated balance and flagged when they disagree —
 * they never overwrite it.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CalculatedBalanceRow = {
  bank_account_id: string;
  opening_balance: number;
  reconciled_total: number;
  reconciled_count: number;
  calculated_balance: number;
};

/** Cents of tolerance before a manual snapshot is treated as a mismatch. */
export const SNAPSHOT_TOLERANCE = 0.05;

export function useCalculatedBankBalances(asOf?: string | null) {
  const q = useQuery({
    queryKey: ["finance", "bank-calculated-balances", asOf ?? "now"],
    queryFn: async (): Promise<CalculatedBalanceRow[]> => {
      const { data, error } = await supabase.rpc("bank_calculated_balances", {
        _as_of: asOf ?? undefined,
      });
      if (error) throw error;
      return ((data ?? []) as CalculatedBalanceRow[]).map((r) => ({
        bank_account_id: r.bank_account_id,
        opening_balance: Number(r.opening_balance ?? 0),
        reconciled_total: Number(r.reconciled_total ?? 0),
        reconciled_count: Number(r.reconciled_count ?? 0),
        calculated_balance: Number(r.calculated_balance ?? 0),
      }));
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const byAccount = useMemo(() => {
    const m = new Map<string, CalculatedBalanceRow>();
    for (const r of q.data ?? []) m.set(r.bank_account_id, r);
    return m;
  }, [q.data]);

  return { ...q, byAccount };
}

/** Sums the calculated balance of the given account ids. */
export function sumCalculatedBalances(
  byAccount: Map<string, CalculatedBalanceRow>,
  accountIds: Iterable<string>,
) {
  let total = 0;
  for (const id of accountIds) {
    total += byAccount.get(id)?.calculated_balance ?? 0;
  }
  return total;
}

export type SnapshotCheck = {
  status: "match" | "mismatch";
  snapshot: number;
  calculated: number;
  difference: number;
};

/** Compares a manual snapshot against the calculated balance for the same date. */
export function checkSnapshot(
  snapshotBalance: number,
  calculatedBalance: number,
): SnapshotCheck {
  const difference =
    Math.round((snapshotBalance - calculatedBalance + Number.EPSILON) * 100) /
    100;
  return {
    status: Math.abs(difference) <= SNAPSHOT_TOLERANCE ? "match" : "mismatch",
    snapshot: snapshotBalance,
    calculated: calculatedBalance,
    difference,
  };
}

/** Calculated balance for one account at a given date (for snapshot checks). */
export function useCalculatedBalanceAt(
  accountId: string | null,
  asOf: string | null,
) {
  return useQuery({
    queryKey: ["finance", "bank-calculated-balance-at", accountId, asOf],
    enabled: !!accountId && !!asOf,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc(
        "bank_account_calculated_balance",
        { _account_id: accountId!, _as_of: asOf! },
      );
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}
