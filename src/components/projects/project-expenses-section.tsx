import i18n from "@/i18n/index";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from '@/lib/toast';
import { Plus, Pencil, Trash2, FileCheck2, Upload, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import { usePaymentCards } from "@/lib/finance/use-payment-cards";
import { createProjectExpenseFromReceipt } from "@/lib/projects/expense-from-receipt";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProjectExpenseDialog } from "./project-expense-dialog";
import { MarkExpenseInvoicedDialog } from "./mark-expense-invoiced-dialog";
import { RequestApprovalDialog, RejectExpenseDialog } from "./expense-approval-dialogs";
import { useCollaboratorsList } from "@/lib/hr/use-collaborators";
import { Check, X, Send } from "lucide-react";
import {
  useDeleteProjectExpense,
  useProjectExpenses,
  useDecideExpenseApproval,
  isReadyToInvoice,
  canRequestApproval,
  type ProjectExpenseWithSupplier,
} from "@/lib/projects/use-project-expenses";
import { resolveSupplierLabel } from "@/lib/projects/use-suppliers";
import { euros } from "@/lib/projects/gantt-utils";

interface Props {
  projectId: string;
  /** Can submit expenses: admin or assigned to this project. */
  canEdit: boolean;
  /** Admin / projects.view_financials (all): sees totals, invoicing, every status. */
  privileged?: boolean;
}

export function ProjectExpensesSection({ projectId, canEdit, privileged = false }: Props) {
  const { t } = useTranslation("projects");
  const { data: items = [], isLoading } = useProjectExpenses(projectId);
  const del = useDeleteProjectExpense(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectExpenseWithSupplier | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectExpenseWithSupplier | null>(null);
  const [markInvoiced, setMarkInvoiced] = useState<ProjectExpenseWithSupplier | null>(null);
  const [view, setView] = useState<"all" | "ready">("all");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const qc = useQueryClient();
  const { profile, user } = useProjectsAuth();
  const cardsQ = usePaymentCards();
  const collabQ = useCollaboratorsList({ status: "all" });
  const nameOf = (id: string | null | undefined) =>
    id ? (collabQ.data ?? []).find((c) => c.id === id)?.nome ?? null : null;
  const decide = useDecideExpenseApproval(projectId);
  const [requesting, setRequesting] = useState<ProjectExpenseWithSupplier | null>(null);
  const [rejecting, setRejecting] = useState<ProjectExpenseWithSupplier | null>(null);
  const myCollab = profile?.collaborator_id ?? null;
  const isMyPending = (e: ProjectExpenseWithSupplier) =>
    e.approval_state === "pending" && !!myCollab && e.approval_requested_from === myCollab;
  const canEditRow = (e: ProjectExpenseWithSupplier) =>
    canEdit && (privileged || (e.submitted_by === user?.id &&
      (e.status === "draft" || e.status === "submitted") &&
      (e.approval_state === "not_required" || e.approval_state === "rejected") && !e.invoiced_at));
  async function approve(e: ProjectExpenseWithSupplier) {
    try { await decide.mutateAsync({ expenseId: e.id, approve: true }); toast.success(t("expenses.approval.approvedToast")); }
    catch (err) { toast.error((err as Error).message); }
  }

  // Files run one at a time (rate limits); a failed read still leaves a draft.
  async function handleFiles(files: File[]) {
    if (!canEdit || busy || files.length === 0) return;
    const folder = profile?.collaborator_id;
    if (!folder) { toast.error(t("expenses.fields.receiptNoProfile")); return; }
    let ok = 0, unread = 0;
    const failed: string[] = [];
    setBusy({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      try {
        const r = await createProjectExpenseFromReceipt({ file: files[i], projectId, collaboratorId: folder, cards: cardsQ.data ?? [] });
        ok++; if (!r.read) unread++;
      } catch { failed.push(files[i].name); }
      setBusy({ done: i + 1, total: files.length });
      qc.invalidateQueries({ queryKey: ["project-expenses", projectId] });
    }
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["project-insights", projectId] });
    if (ok) toast.success(t("expenses.drop.added", { count: ok }));
    if (unread) toast.warning(t("expenses.drop.unread", { count: unread }));
    if (failed.length) toast.error(t("expenses.drop.failed", { names: failed.join(", ") }));
  }
  const dropHandlers = canEdit ? {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); void handleFiles(Array.from(e.dataTransfer.files)); },
  } : {};
  const pickFiles = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.multiple = true; inp.accept = "image/*,application/pdf";
    inp.onchange = () => void handleFiles(Array.from(inp.files ?? []));
    inp.click();
  };

  const isReady = (e: ProjectExpenseWithSupplier) => isReadyToInvoice(e);
  const showActions = canEdit || items.some(isMyPending);
  const readyCount = items.filter(isReady).length;
  const shown = view === "ready" ? items.filter(isReady) : items;

  const totals = items.reduce(
    (acc, e) => {
      const cost = Number(e.purchase_price || 0);
      acc.cost += cost;
      if (e.rebillable) acc.rebillable += cost;
      return acc;
    },
    { cost: 0, rebillable: 0 },
  );

  function handleEdit(item: ProjectExpenseWithSupplier) {
    setEditing(item);
    setDialogOpen(true);
  }
  function handleAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del.mutateAsync(confirmDelete.id);
      toast.success(t("expenses.toast.deleted"));
      setConfirmDelete(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div {...dropHandlers} className={`relative rounded-xl border bg-card shadow-sm transition-colors ${dragOver ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      {(dragOver || busy) && items.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          {busy ? t("expenses.drop.processing", { done: busy.done, total: busy.total }) : t("expenses.drop.release")}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-border bg-gradient-to-r from-muted/40 to-transparent px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {t("expenses.title")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("expenses.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(["all", "ready"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                view === v
                  ? "rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
                  : "rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              }
            >
              {v === "all" ? t("expenses.allExpenses") : i18n.t("projects:projectExpensesSection.ui.labelWithParenthesis", { value1: t("expenses.readyToInvoice"), value2: readyCount })}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button size="sm" className="h-8" onClick={handleAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("expenses.addButton")}
          </Button>
        )}
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">…</div>
      ) : shown.length === 0 ? (
        view === "all" && canEdit ? (
          <div className="p-4">
            <button
              type="button"
              onClick={pickFiles}
              disabled={!!busy}
              className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40"}`}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
              <span className="text-sm font-medium text-foreground">
                {busy ? t("expenses.drop.processing", { done: busy.done, total: busy.total }) : t("expenses.drop.emptyTitle")}
              </span>
              <span className="text-xs text-muted-foreground">{t("expenses.drop.emptyHint")}</span>
            </button>
          </div>
        ) : (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {view === "ready" ? t("expenses.readyEmpty") : t("expenses.empty")}
        </div>
        )
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("expenses.cols.description")}</TableHead>
                <TableHead>{t("expenses.cols.category")}</TableHead>
                <TableHead>{t("expenses.cols.vendor")}</TableHead>
                <TableHead>{t("expenses.cols.date")}</TableHead>
                <TableHead>{t("expenses.cols.status")}</TableHead>
                <TableHead className="text-right">{t("expenses.cols.amount")}</TableHead>
                {showActions && <TableHead className="w-32"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.description}</div>
                    {e.rebillable && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {t("expenses.rebillableTag")}
                      </Badge>
                    )}
                    {nameOf(e.submitted_by_collaborator_id) && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {t("expenses.approval.submittedBy", { name: nameOf(e.submitted_by_collaborator_id) })}
                      </div>
                    )}
                    {e.approval_state === "pending" && (
                      <Badge variant="outline" className="mr-1 mt-1 border-warning/50 text-[10px]">
                        {t("expenses.approval.pending", { name: nameOf(e.approval_requested_from) ?? "—" })}
                      </Badge>
                    )}
                    {e.approval_state === "approved" && (
                      <Badge variant="outline" className="mr-1 mt-1 text-[10px]">
                        {t("expenses.approval.approvedBy", { name: nameOf(e.approval_requested_from) ?? "—" })}
                      </Badge>
                    )}
                    {e.approval_state === "rejected" && (
                      <Badge variant="destructive" className="mr-1 mt-1 text-[10px]" title={e.approval_note ?? undefined}>
                        {e.approval_note ? t("expenses.approval.rejectedNote", { note: e.approval_note }) : t("expenses.approval.rejected")}
                      </Badge>
                    )}
                    {e.invoiced_at && (
                      <Badge variant="outline" className="ml-1 mt-1 text-[10px]">
                        {e.invoice_reference
                          ? t("expenses.invoicedBadgeRef", { ref: e.invoice_reference })
                          : t("expenses.invoicedBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t(`expenses.category.${e.category}`)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {resolveSupplierLabel(e.supplier, e.vendor ?? null)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.incurred_at ?? e.expense_date ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {t(`expenses.status.${e.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {euros(Number(e.purchase_price || 0))}
                  </TableCell>
                  {showActions && (
                    <TableCell className="whitespace-nowrap text-right">
                      {isMyPending(e) && (
                        <>
                          <Button variant="ghost" size="icon" title={t("expenses.approval.approve")} aria-label={t("expenses.approval.approve")} disabled={decide.isPending} onClick={() => approve(e)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t("expenses.approval.reject")} aria-label={t("expenses.approval.reject")} onClick={() => setRejecting(e)}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                      {canEditRow(e) && canRequestApproval(e) && e.approval_state !== "pending" && (
                        <Button variant="ghost" size="icon" title={t("expenses.approval.request")} aria-label={t("expenses.approval.request")} onClick={() => setRequesting(e)}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {privileged && isReady(e) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("expenses.markInvoiced")}
                          aria-label={t("expenses.markInvoiced")}
                          onClick={() => setMarkInvoiced(e)}
                        >
                          <FileCheck2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEditRow(e) && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (privileged || e.status === "draft") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDelete(e)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {privileged && (
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={5} className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("expenses.totals")}
                  {totals.rebillable > 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({t("expenses.rebillableTotal", { amount: euros(totals.rebillable) })})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {euros(totals.cost)}
                </TableCell>
                {showActions && <TableCell />}
              </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ProjectExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        initial={editing}
        privileged={privileged}
        onRequestApproval={editing ? () => { setDialogOpen(false); setRequesting(editing); } : undefined}
      />

      <RequestApprovalDialog projectId={projectId} expense={requesting} onOpenChange={(o) => !o && setRequesting(null)} />
      <RejectExpenseDialog projectId={projectId} expense={rejecting} onOpenChange={(o) => !o && setRejecting(null)} />

      <MarkExpenseInvoicedDialog
        projectId={projectId}
        expense={markInvoiced}
        onOpenChange={(o) => !o && setMarkInvoiced(null)}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("expenses.confirmDelete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("expenses.confirmDelete.description", {
                name: confirmDelete?.description ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("expenses.confirmDelete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("expenses.confirmDelete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
