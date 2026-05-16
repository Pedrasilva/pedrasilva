import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Inbox, Check, X, BadgeEuro, Undo2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type Event = {
  id: string;
  expense_id: string;
  actor_id: string | null;
  event_type: "submitted" | "approved" | "rejected" | "paid" | "edited" | "reopened";
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  created_at: string;
};

type ActorMap = Record<string, { nome: string }>;

const ICONS = {
  submitted: Inbox,
  approved: Check,
  rejected: X,
  paid: BadgeEuro,
  reopened: Undo2,
  edited: Pencil,
} as const;

const LABELS_PT: Record<Event["event_type"], string> = {
  submitted: "Submetida",
  approved: "Aprovada",
  rejected: "Rejeitada",
  paid: "Paga",
  reopened: "Reaberta",
  edited: "Editada",
};

const COLORS: Record<Event["event_type"], string> = {
  submitted: "text-muted-foreground bg-muted",
  approved: "text-emerald-700 bg-emerald-100",
  rejected: "text-rose-700 bg-rose-100",
  paid: "text-sky-700 bg-sky-100",
  reopened: "text-amber-700 bg-amber-100",
  edited: "text-slate-700 bg-slate-100",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function BenefitExpenseTimeline({ expenseId }: { expenseId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["benefit-expense-events", expenseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefit_expense_events")
        .select("*")
        .eq("expense_id", expenseId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Event[];
    },
  });

  const { data: actors = {} } = useQuery({
    queryKey: ["pm-user-resource-map"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pm_list_user_resource_map");
      if (error) throw error;
      const map: ActorMap = {};
      for (const r of (data ?? []) as Array<{ user_id: string; collaborator_nome: string | null }>) {
        if (r.user_id) map[r.user_id] = { nome: r.collaborator_nome ?? "—" };
      }
      return map;
    },
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">A carregar histórico…</p>;
  }
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem eventos.</p>;
  }

  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const Icon = ICONS[e.event_type] ?? Inbox;
        const actorName = e.actor_id ? actors[e.actor_id]?.nome ?? "Sistema" : "Sistema";
        return (
          <li key={e.id} className="flex gap-3">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                COLORS[e.event_type],
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {LABELS_PT[e.event_type]}{" "}
                <span className="font-normal text-muted-foreground">por {actorName}</span>
              </div>
              <div className="text-xs text-muted-foreground">{fmt(e.created_at)}</div>
              {e.notes && (
                <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs whitespace-pre-wrap">
                  {e.notes}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
