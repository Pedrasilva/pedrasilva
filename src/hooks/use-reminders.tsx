import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationKeys } from "@/hooks/use-notifications";

export type Reminder = {
  id: string;
  owner_user_id: string;
  created_by: string | null;
  title: string;
  notes: string | null;
  due_date: string | null;
  module: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  created_at: string;
};

export type ReminderBucket = "overdue" | "today" | "upcoming" | "undated";

export const reminderKeys = {
  all: ["reminders"] as const,
  mine: () => ["reminders", "mine"] as const,
};

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

export function bucketFor(due: string | null): ReminderBucket {
  if (!due) return "undated";
  const today = todayIso();
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

/** Path to the record a reminder points at, when we know how to link it. */
export function reminderLink(r: Pick<Reminder, "entity_type" | "entity_id">): string | null {
  if (r.entity_type === "crm_opportunity" && r.entity_id) {
    return `/crm/opportunities/${r.entity_id}`;
  }
  return null;
}

/** Open reminders owned by the signed-in user, soonest first. */
export function useMyReminders({ windowDays = 7 }: { windowDays?: number } = {}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: [...reminderKeys.mine(), windowDays],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + windowDays);
      const horizonIso = horizon.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("reminders")
        .select(
          "id, owner_user_id, created_by, title, notes, due_date, module, entity_type, entity_id, status, created_at",
        )
        .eq("owner_user_id", userId as string)
        .eq("status", "open")
        .or(`due_date.is.null,due_date.lte.${horizonIso}`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });
}

export function useCompleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("reminders")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reminderKeys.all });
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
