import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";

export type HrActivityKind =
  | "benefit_submitted"
  | "benefit_approved"
  | "benefit_rejected"
  | "benefit_paid"
  | "benefit_finance_paid"
  | "benefit_sync_failed"
  | "vacation_requested"
  | "vacation_approved"
  | "vacation_rejected"
  | "collaborator_created"
  | "collaborator_archived";

export type HrActivity = {
  id: string;
  kind: HrActivityKind;
  at: string; // ISO
  actorName: string | null;
  subjectName: string | null;
  /** Short raw description (PT, fallback) */
  hint?: string;
};

const LIMIT = 25;

export function useHrRecentActivity() {
  const { user, isAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const canApprove = isAdmin || permissions.has("hr.beneficios.approve");
  const canSeeCols = isAdmin || permissions.has("hr.colaboradores");

  return useQuery({
    queryKey: ["hr-recent-activity", user?.id, isAdmin, canApprove, canSeeCols],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<HrActivity[]> => {
      const out: HrActivity[] = [];

      // Benefit events
      const { data: bevs } = await supabase
        .from("benefit_expense_events")
        .select("id, event_type, created_at, expense_id, actor_id, notes")
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      const benefitEvents = (bevs ?? []) as Array<{
        id: string;
        event_type: string;
        created_at: string;
        expense_id: string;
        actor_id: string | null;
        notes: string | null;
      }>;

      const expenseIds = Array.from(new Set(benefitEvents.map((b) => b.expense_id)));
      const benefitMap = new Map<string, { collaborator_id: string }>();
      if (expenseIds.length) {
        const { data: bes } = await supabase
          .from("benefit_expenses")
          .select("id, collaborator_id")
          .in("id", expenseIds);
        for (const b of (bes ?? []) as Array<{ id: string; collaborator_id: string }>) {
          benefitMap.set(b.id, { collaborator_id: b.collaborator_id });
        }
      }

      // Vacation events — derive from updated_at + estado
      let vacs: Array<{
        id: string;
        collaborator_id: string;
        estado: string;
        created_at: string;
        updated_at: string;
        aprovado_em: string | null;
        aprovado_por: string | null;
      }> = [];
      if (canSeeCols) {
        const { data } = await supabase
          .from("vacation_requests")
          .select("id, collaborator_id, estado, created_at, updated_at, aprovado_em, aprovado_por")
          .order("updated_at", { ascending: false })
          .limit(LIMIT);
        vacs = data ?? [];
      }

      // Recent collaborator changes (created / archived)
      let cols: Array<{
        id: string;
        nome: string;
        created_at: string;
        archived_at: string | null;
      }> = [];
      if (canSeeCols) {
        const { data } = await supabase
          .from("collaborators")
          .select("id, nome, created_at, archived_at")
          .order("created_at", { ascending: false })
          .limit(LIMIT);
        cols = data ?? [];
      }

      // Resolve collaborator names
      const collabIds = new Set<string>();
      for (const b of benefitEvents) {
        const meta = benefitMap.get(b.expense_id);
        if (meta) collabIds.add(meta.collaborator_id);
      }
      for (const v of vacs) collabIds.add(v.collaborator_id);
      const collabMap = new Map<string, string>();
      if (collabIds.size) {
        const { data } = await supabase
          .from("collaborators")
          .select("id, nome")
          .in("id", Array.from(collabIds));
        for (const c of (data ?? []) as Array<{ id: string; nome: string }>) {
          collabMap.set(c.id, c.nome);
        }
      }

      // ---- emit ----
      for (const b of benefitEvents) {
        if (!canApprove && b.event_type !== "paid" && b.event_type !== "finance_paid") {
          // hide approval-stream details from non-approvers
        }
        const meta = benefitMap.get(b.expense_id);
        const subject = meta ? collabMap.get(meta.collaborator_id) ?? null : null;
        const kind: HrActivityKind | null =
          b.event_type === "submitted" ? "benefit_submitted"
          : b.event_type === "approved" ? "benefit_approved"
          : b.event_type === "rejected" ? "benefit_rejected"
          : b.event_type === "paid" ? "benefit_paid"
          : b.event_type === "finance_paid" ? "benefit_finance_paid"
          : b.event_type === "finance_paid_hr_sync_failed" ? "benefit_sync_failed"
          : null;
        if (!kind) continue;
        out.push({
          id: `be-${b.id}`,
          kind,
          at: b.created_at,
          actorName: null,
          subjectName: subject,
          hint: b.notes ?? undefined,
        });
      }

      for (const v of vacs) {
        const subject = collabMap.get(v.collaborator_id) ?? null;
        if (v.estado === "pendente") {
          out.push({
            id: `vac-${v.id}`,
            kind: "vacation_requested",
            at: v.created_at,
            actorName: null,
            subjectName: subject,
          });
        } else if (v.estado === "aprovada") {
          out.push({
            id: `vac-${v.id}`,
            kind: "vacation_approved",
            at: v.aprovado_em ?? v.updated_at,
            actorName: null,
            subjectName: subject,
          });
        } else if (v.estado === "rejeitada") {
          out.push({
            id: `vac-${v.id}`,
            kind: "vacation_rejected",
            at: v.updated_at,
            actorName: null,
            subjectName: subject,
          });
        }
      }

      for (const c of cols) {
        out.push({
          id: `col-c-${c.id}`,
          kind: "collaborator_created",
          at: c.created_at,
          actorName: null,
          subjectName: c.nome,
        });
        if (c.archived_at) {
          out.push({
            id: `col-a-${c.id}`,
            kind: "collaborator_archived",
            at: c.archived_at,
            actorName: null,
            subjectName: c.nome,
          });
        }
      }

      out.sort((a, b) => (a.at < b.at ? 1 : -1));
      return out.slice(0, LIMIT);
    },
  });
}
