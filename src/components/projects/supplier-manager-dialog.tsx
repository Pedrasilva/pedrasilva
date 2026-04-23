/**
 * Lightweight management surface for the supplier directory.
 * Lists all suppliers (active + archived), allows create / edit / archive.
 *
 * Deliberately minimal — no pagination, no advanced filters, no bulk ops.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Pencil, Archive, ArchiveRestore } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useArchiveSupplier,
  useSuppliers,
  type Supplier,
} from "@/lib/projects/use-suppliers";
import { SupplierFormDialog } from "./supplier-form-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupplierManagerDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("projects");
  const { data: suppliers = [], isLoading } = useSuppliers({
    includeInactive: true,
  });
  const archive = useArchiveSupplier();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  function handleAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function handleEdit(s: Supplier) {
    setEditing(s);
    setFormOpen(true);
  }
  async function handleToggleActive(s: Supplier) {
    try {
      await archive.mutateAsync({ id: s.id, active: !s.active });
      toast.success(
        s.active
          ? t("suppliers.toast.archived")
          : t("suppliers.toast.restored"),
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>{t("suppliers.manager.title")}</DialogTitle>
              <Button size="sm" onClick={handleAdd}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("suppliers.manager.addButton")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("suppliers.manager.subtitle")}
            </p>
          </DialogHeader>

          {isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              …
            </div>
          ) : suppliers.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("suppliers.manager.empty")}
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("suppliers.cols.name")}</TableHead>
                    <TableHead>{t("suppliers.cols.contact")}</TableHead>
                    <TableHead>{t("suppliers.cols.email")}</TableHead>
                    <TableHead>{t("suppliers.cols.phone")}</TableHead>
                    <TableHead>{t("suppliers.cols.status")}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id} className={!s.active ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.contact_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.phone ?? "—"}
                      </TableCell>
                      <TableCell>
                        {s.active ? (
                          <Badge variant="outline" className="text-[10px]">
                            {t("suppliers.status.active")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("suppliers.status.archived")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(s)}
                          aria-label={t("suppliers.actions.edit")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleActive(s)}
                          aria-label={
                            s.active
                              ? t("suppliers.actions.archive")
                              : t("suppliers.actions.restore")
                          }
                        >
                          {s.active ? (
                            <Archive className="h-3.5 w-3.5" />
                          ) : (
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SupplierFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
      />
    </>
  );
}
