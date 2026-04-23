import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import {
  useDeleteProjectExpense,
  useProjectExpenses,
  type ProjectExpenseWithSupplier,
} from "@/lib/projects/use-project-expenses";
import { resolveSupplierLabel } from "@/lib/projects/use-suppliers";
import { euros } from "@/lib/projects/gantt-utils";

interface Props {
  projectId: string;
  canEdit: boolean;
}

export function ProjectExpensesSection({ projectId, canEdit }: Props) {
  const { t } = useTranslation("projects");
  const { data: items = [], isLoading } = useProjectExpenses(projectId);
  const del = useDeleteProjectExpense(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectExpenseWithSupplier | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectExpenseWithSupplier | null>(null);

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
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("expenses.title")}
          </h3>
          <p className="text-[11px] text-muted-foreground">{t("expenses.subtitle")}</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("expenses.addButton")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t("expenses.empty")}
        </div>
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
                {canEdit && <TableHead className="w-20"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.description}</div>
                    {e.rebillable && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {t("expenses.rebillableTag")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t(`expenses.category.${e.category}`)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.vendor ?? "—"}
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
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(e)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(e)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
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
                {canEdit && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <ProjectExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        initial={editing}
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
