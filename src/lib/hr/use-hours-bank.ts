/**
 * Hours Bank — an auditable ledger of signed hour movements per collaborator.
 *
 * The balance is ALWAYS the sum of the ledger; there is no stored balance
 * anywhere. Credits come from additional hours explicitly acknowledged when a
 * week is approved; debits come from compensation (extra leave, payment) or an
 * HR manual adjustment, which always requires a reason.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HoursBankType =
  | "additional_hours"
  | "converted_to_leave"
  | "paid_compensation"
  | "manual_adjustment"
  | "opening_balance"
  | "shortfall";

export const TRACKING_START_DEFAULT = "2026-06-01";

export interface HoursBankEntry {
  id: string;
  collaborator_id: string;
  week_id: string | null;
  entry_date: string;
  transaction_type: HoursBankType;
  hours: number;
  reason: string | null;
  vacation_request_id: string | null;
  created_by: string | null;
  created_at: string;
  week_start: string | null;
  week_end: string | null;
  as_of_date: string | null;
  /** True when the movement belongs to a week before the opening balance date (no effect). */
  excluded: boolean;
  /** Running balance up to and including this row (oldest first). */
  balance: number;
}

export function useHoursBank(collaboratorId: string | null) {
  return useQuery({
    queryKey: ["pm-hours-bank", collaboratorId],
    enabled: !!collaboratorId,
    queryFn: async (): Promise<{ entries: HoursBankEntry[]; balance: number; opening: HoursBankEntry | null }> => {
      const { data, error } = await supabase
        .from("pm_hours_bank_entries")
        .select(
          "id, collaborator_id, week_id, entry_date, transaction_type, hours, reason, vacation_request_id, created_by, created_at, as_of_date, week:pm_timesheet_weeks(week_start, week_end)",
        )
        .eq("collaborator_id", collaboratorId!)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;

      type Raw = Omit<HoursBankEntry, "balance" | "week_start" | "week_end" | "excluded"> & {
        week: { week_start: string; week_end: string } | null;
      };
      const raw = ((data ?? []) as unknown as Raw[]).slice();
      const opening = raw.find((e) => e.transaction_type === "opening_balance") ?? null;
      const asOf = opening?.as_of_date ?? null;
      // Opening balance is always the first line of the ledger.
      raw.sort((x, y) => {
        const ox = x.transaction_type === "opening_balance" ? 0 : 1;
        const oy = y.transaction_type === "opening_balance" ? 0 : 1;
        return ox - oy;
      });

      let running = 0;
      const entries = raw.map((e) => {
        const weekEnd = e.week?.week_end ?? null;
        const excluded =
          !!asOf && !!weekEnd && weekEnd < asOf &&
          (e.transaction_type === "additional_hours" || e.transaction_type === "shortfall");
        if (!excluded) running = Math.round((running + Number(e.hours)) * 100) / 100;
        return {
          ...e,
          hours: Number(e.hours),
          week_start: e.week?.week_start ?? null,
          week_end: weekEnd,
          excluded,
          balance: running,
        } as HoursBankEntry;
      });

      // Newest first for display; balance already reflects chronological order.
      return { entries: entries.slice().reverse(), balance: running, opening: entries.find((e) => e.transaction_type === "opening_balance") ?? null };
    },
  });
}

export interface HoursBankMovementInput {
  collaboratorId: string;
  transactionType: HoursBankType;
  /** Positive number of hours; the sign is applied from the transaction type. */
  hours: number;
  reason: string | null;
  createdBy: string | null;
  vacationRequestId?: string | null;
}

export function useAddHoursBankMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HoursBankMovementInput) => {
      const magnitude = Math.abs(input.hours);
      const signed =
        input.transactionType === "converted_to_leave" ||
        input.transactionType === "paid_compensation"
          ? -magnitude
          : input.transactionType === "manual_adjustment"
            ? input.hours
            : magnitude;
      const { error } = await supabase.from("pm_hours_bank_entries").insert({
        collaborator_id: input.collaboratorId,
        transaction_type: input.transactionType,
        hours: signed,
        reason: input.reason,
        created_by: input.createdBy,
        vacation_request_id: input.vacationRequestId ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-hours-bank"] });
    },
  });
}

/** Create or edit the single opening balance. Edits are audited by the database. */
export function useSetOpeningBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      collaboratorId: string;
      existingId: string | null;
      hours: number;
      asOf: string;
      reason: string;
      createdBy: string | null;
    }) => {
      if (input.existingId) {
        const { error } = await supabase
          .from("pm_hours_bank_entries")
          .update({ hours: input.hours, as_of_date: input.asOf, reason: input.reason } as never)
          .eq("id", input.existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pm_hours_bank_entries").insert({
          collaborator_id: input.collaboratorId,
          transaction_type: "opening_balance",
          hours: input.hours,
          as_of_date: input.asOf,
          entry_date: input.asOf,
          reason: input.reason,
          created_by: input.createdBy,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-hours-bank"] }),
  });
}

export interface OpeningAuditRow {
  id: string;
  changed_by: string | null;
  changed_at: string;
  old_hours: number | null;
  new_hours: number | null;
  old_as_of: string | null;
  new_as_of: string | null;
}

export function useOpeningBalanceAudit(collaboratorId: string | null) {
  return useQuery({
    queryKey: ["pm-hours-bank", "audit", collaboratorId],
    enabled: !!collaboratorId,
    queryFn: async (): Promise<OpeningAuditRow[]> => {
      const { data, error } = await supabase
        .from("pm_hours_bank_audit")
        .select("id, changed_by, changed_at, old_hours, new_hours, old_as_of, new_as_of")
        .eq("collaborator_id", collaboratorId!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpeningAuditRow[];
    },
  });
}

/** Hours → "2 days + 2h" using the person's own contractual working day. */
export function describeHours(hours: number, dailyHours: number): { days: number; rest: number } {
  const daily = dailyHours > 0 ? dailyHours : 8;
  const sign = hours < 0 ? -1 : 1;
  const abs = Math.abs(hours);
  const days = Math.floor(abs / daily);
  const rest = Math.round((abs - days * daily) * 100) / 100;
  return { days: sign * days, rest: sign * rest };
}
