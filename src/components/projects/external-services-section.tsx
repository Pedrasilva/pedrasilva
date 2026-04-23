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
import { ExternalServiceDialog } from "./external-service-dialog";
import {
  useExternalServices,
  useDeleteExternalService,
  type ExternalService,
} from "@/lib/projects/use-external-services";
import { euros } from "@/lib/projects/gantt-utils";

interface Props {
  projectId: string;
  canEdit: boolean;
}

export function ExternalServicesSection({ projectId, canEdit }: Props) {
  const { t } = useTranslation("projects");
  const { data: items = [], isLoading } = useExternalServices(projectId);
  const del = useDeleteExternalService(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalService | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExternalService | null>(null);

  const totals = items.reduce(
    (acc, m) => {
      const qty = Number(m.quantity || 1);
      const cost = Number(m.purchase_price || 0) * qty;
      const revenue = Number(m.sale_price || 0) * qty;
      acc.cost += cost;
      acc.revenue += revenue;
      acc.margin += revenue - cost;
      return acc;
    },
    { cost: 0, revenue: 0, margin: 0 },
  );

  function handleEdit(item: ExternalService) {
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
      toast.success(t("externalServices.toast.deleted"));
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
            {t("externalServices.title")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t("externalServices.subtitle")}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("externalServices.addButton")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t("externalServices.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("externalServices.cols.description")}</TableHead>
                <TableHead>{t("externalServices.cols.supplier")}</TableHead>
                <TableHead>{t("externalServices.cols.status")}</TableHead>
                <TableHead className="text-right">{t("externalServices.cols.cost")}</TableHead>
                <TableHead className="text-right">{t("externalServices.cols.revenue")}</TableHead>
                <TableHead className="text-right">{t("externalServices.cols.margin")}</TableHead>
                {canEdit && <TableHead className="w-20"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => {
                const qty = Number(m.quantity || 1);
                const cost = Number(m.purchase_price || 0) * qty;
                const revenue = Number(m.sale_price || 0) * qty;
                const margin = revenue - cost;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.description}</div>
                      {m.invoice_reference && (
                        <div className="text-[11px] text-muted-foreground">
                          {t("externalServices.cols.invoiceRef")}: {m.invoice_reference}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.supplier_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {t(`externalServices.status.${m.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {euros(cost)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {euros(revenue)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm tabular-nums ${margin < 0 ? "text-destructive" : ""}`}
                    >
                      {euros(margin)}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDelete(m)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={3} className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("externalServices.totals")}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {euros(totals.cost)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {euros(totals.revenue)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${totals.margin < 0 ? "text-destructive" : ""}`}
                >
                  {euros(totals.margin)}
                </TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <ExternalServiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        initial={editing}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("externalServices.confirmDelete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("externalServices.confirmDelete.description", {
                name: confirmDelete?.description ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("externalServices.confirmDelete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("externalServices.confirmDelete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
