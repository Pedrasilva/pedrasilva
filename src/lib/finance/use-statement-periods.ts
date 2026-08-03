/**
 * Bank statement periods — user-declared, numbered statement checkpoints.
 *
 * A period ("006/2026") mirrors a real bank/PHC statement: the user types the
 * opening and closing balances straight off the paper statement. Nothing here
 * is derived from the app's own data — the declared figures are the reference.
 *
 * A transaction belongs to a period when its date falls inside the period's
 * range for that account, unless it carries an explicit
 * `bank_transactions.statement_period_id` override (edge cases where the bank
 * itself attributed a boundary-dated movement differently).
 *
 * Status follows exactly the same rule as the manual balance snapshots
 * (see `use-bank-balances.ts`): declared opening + sum of RECONCILED
 * transactions in the period = computed closing; compare with the declared
 * closing within a small tolerance → Confirmed / Mismatch.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Cents of tolerance before a declared closing is treated as a mismatch. */
export const PERIOD_TOLERANCE = 0.05;

export type StatementPeriod = {
  id: string;
  bank_account_id: string;
  statement_number: string;
  period_start_date: string;
  period_end_date: string;
  opening_balance: number;
  closing_balance: number;
  notes: string | null;
};

export type StatementPeriodStatus = {
  period_id: string;
  bank_account_id: string;
  statement_number: string;
  period_start_date: string;
  period_end_date: string;
  opening_balance: number;
  declared_closing: number;
  reconciled_total: number;
  reconciled_count: number;
  tx_count: number;
  computed_closing: number;
  difference: number;
};

export type PeriodCheck = StatementPeriodStatus & {
  status: "confirmed" | "mismatch";
};

export function useStatementPeriods(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ["finance", "bank-statement-periods", accountId ?? "all"],
    enabled: !!accountId,
    queryFn: async (): Promise<StatementPeriod[]> => {
      const { data, error } = await supabase
        .from("bank_statement_periods")
        .select(
          "id, bank_account_id, statement_number, period_start_date, period_end_date, opening_balance, closing_balance, notes",
        )
        .eq("bank_account_id", accountId!)
        .order("period_start_date", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as StatementPeriod[]).map((p) => ({
        ...p,
        opening_balance: Number(p.opening_balance ?? 0),
        closing_balance: Number(p.closing_balance ?? 0),
      }));
    },
  });
}

export function useStatementPeriodStatus(accountId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["finance", "bank-statement-period-status", accountId ?? "all"],
    enabled: !!accountId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<PeriodCheck[]> => {
      const { data, error } = await supabase.rpc(
        "bank_statement_period_status",
        { _account_id: accountId! },
      );
      if (error) throw error;
      return ((data ?? []) as StatementPeriodStatus[]).map((r) => {
        const difference =
          Math.round((Number(r.difference ?? 0) + Number.EPSILON) * 100) / 100;
        return {
          ...r,
          opening_balance: Number(r.opening_balance ?? 0),
          declared_closing: Number(r.declared_closing ?? 0),
          reconciled_total: Number(r.reconciled_total ?? 0),
          reconciled_count: Number(r.reconciled_count ?? 0),
          tx_count: Number(r.tx_count ?? 0),
          computed_closing: Number(r.computed_closing ?? 0),
          difference,
          status:
            Math.abs(difference) <= PERIOD_TOLERANCE ? "confirmed" : "mismatch",
        } as PeriodCheck;
      });
    },
  });

  const byPeriod = useMemo(() => {
    const m = new Map<string, PeriodCheck>();
    for (const r of q.data ?? []) m.set(r.period_id, r);
    return m;
  }, [q.data]);

  return { ...q, byPeriod };
}
