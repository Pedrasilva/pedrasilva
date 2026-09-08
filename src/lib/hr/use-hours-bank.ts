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
  | "manual_adjustment";

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
  /** Running balance up to and including this row (oldest first). */
  balance: number;
}

export function useHoursBank(collaboratorId: string | null) {
  return useQuery({
    queryKey: ["pm-hours-bank", collaboratorId],
    enabled: !!collaboratorId,
    queryFn: async (): Promise<{ entries: HoursBankEntry[]; balance: number }> => {
      const { data, error } = await supabase
        .from("pm_hours_bank_entries")
        .select(
          "id, collaborator_id, week_id, entry_date, transaction_type, hours, reason, vacation_request_id, created_by, created_at, week:pm_timesheet_weeks(week_start)",
        )
        .eq("collaborator_id", collaboratorId!)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;

      let running = 0;
      const entries = ((data ?? []) as unknown as Array<
        Omit<HoursBankEntry, "balance" | "week_start"> & { week: { week_start: string } | null }
      >).map((e) => {
        running = Math.round((running + Number(e.hours)) * 100) / 100;
        return {
          ...e,
          hours: Number(e.hours),
          week_start: e.week?.week_start ?? null,
          balance: running,
        } as HoursBankEntry;
      });

      // Newest first for display; balance already reflects chronological order.
      return { entries: entries.slice().reverse(), balance: running };
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

/** Hours → "2 days + 2h" using the person's own contractual working day. */
export function describeHours(hours: number, dailyHours: number): { days: number; rest: number } {
  const daily = dailyHours > 0 ? dailyHours : 8;
  const sign = hours < 0 ? -1 : 1;
  const abs = Math.abs(hours);
  const days = Math.floor(abs / daily);
  const rest = Math.round((abs - days * daily) * 100) / 100;
  return { days: sign * days, rest: sign * rest };
}
