import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCollaboratorsList } from "@/lib/hr/use-collaborators";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import {
  useDecideExpenseApproval,
  useRequestExpenseApproval,
  type ProjectExpense,
} from "@/lib/projects/use-project-expenses";

/** Picker of active collaborators (never yourself); project managers listed first as suggested. */
export function RequestApprovalDialog({
  projectId,
  expense,
  onOpenChange,
}: {
  projectId: string;
  expense: ProjectExpense | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("projects");
  const { profile } = useProjectsAuth();
  const collabQ = useCollaboratorsList({ status: "active" });
  const req = useRequestExpenseApproval(projectId);
  const [q, setQ] = useState("");

  const managersQ = useQuery({
    queryKey: ["pm-project-managers-collab", projectId],
    enabled: !!expense,
    queryFn: async () => {
      const { data } = await supabase
        .from("pm_project_team")
        .select("role, resource:pm_resources(collaborator_id)")
        .eq("project_id", projectId)
        .eq("role", "manager");
      return new Set(
        ((data ?? []) as { resource: { collaborator_id: string | null } | null }[])
          .map((r) => r.resource?.collaborator_id)
          .filter(Boolean) as string[],
      );
    },
  });

  const list = useMemo(() => {
    const mgr = managersQ.data ?? new Set<string>();
    const needle = q.trim().toLowerCase();
    return (collabQ.data ?? [])
      .filter((c) => c.id !== profile?.collaborator_id)
      .filter((c) => !needle || (c.nome ?? "").toLowerCase().includes(needle))
      .map((c) => ({ id: c.id, nome: c.nome ?? "", manager: mgr.has(c.id) }))
      .sort((a, b) => Number(b.manager) - Number(a.manager) || a.nome.localeCompare(b.nome));
  }, [collabQ.data, managersQ.data, profile?.collaborator_id, q]);

  async function pick(id: string, nome: string) {
    if (!expense) return;
    try {
      const r = await req.mutateAsync({ expenseId: expense.id, approverId: id });
      if (r?.notified === false) toast.warning(t("expenses.approval.sentNoAccount", { name: nome }));
      else toast.success(t("expenses.approval.sent", { name: nome }));
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!expense} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("expenses.approval.request")}</DialogTitle>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("expenses.approval.search")} />
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={req.isPending}
              onClick={() => pick(c.id, c.nome)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span>{c.nome}</span>
              {c.manager && <span className="text-[10px] text-muted-foreground">{t("expenses.approval.suggested")}</span>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RejectExpenseDialog({
  projectId,
  expense,
  onOpenChange,
}: {
  projectId: string;
  expense: ProjectExpense | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("projects");
  const decide = useDecideExpenseApproval(projectId);
  const [note, setNote] = useState("");
  async function submit() {
    if (!expense) return;
    try {
      await decide.mutateAsync({ expenseId: expense.id, approve: false, note });
      toast.success(t("expenses.approval.rejectedToast"));
      setNote("");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <Dialog open={!!expense} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("expenses.approval.reject")}</DialogTitle>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("expenses.approval.notePlaceholder")} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("expenses.confirmDelete.cancel")}</Button>
          <Button variant="destructive" disabled={decide.isPending} onClick={submit}>{t("expenses.approval.reject")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
