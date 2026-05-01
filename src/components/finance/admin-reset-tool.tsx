/**
 * Admin-only reset tool for transactional finance test data.
 *
 * Wipes (after explicit confirmation):
 *   - bank_transactions, bank_statement_imports, bank_transaction_classifications
 *   - bank_balance_snapshots
 *   - financial_documents, financial_document_lines, financial_document_payments
 *   - financial_expense_items, financial_income_items
 *   - financial_import_logs
 *
 * Keeps:
 *   - companies (the unified clients + suppliers master)
 *   - bank_accounts, financial_classifications
 *   - schema, permissions, projects, HR
 *
 * Separate action: "Delete unused supplier companies" — removes only
 * companies flagged is_supplier=true (and not is_client) that are not
 * referenced by any transactional or CRM record. Safe cleanup for test
 * suppliers without touching real CRM/client master data.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminOnly } from "@/components/AdminOnly";

const CONFIRM = "DELETE TEST FINANCE DATA";
const CONFIRM_SUPPLIERS = "DELETE UNUSED SUPPLIER COMPANIES";

const TABLES = [
  "bank_transactions",
  "bank_statement_imports",
  "bank_transaction_classifications",
  "bank_balance_snapshots",
  "financial_documents",
  "financial_document_lines",
  "financial_document_payments",
  "financial_expense_items",
  "financial_income_items",
  "financial_import_logs",
] as const;

function useTableCounts() {
  return useQuery({
    queryKey: ["finance", "reset-counts"],
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (const t of TABLES) {
        const { count, error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from(t as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("*", { count: "exact", head: true }) as any;
        if (error) {
          out[t] = -1;
        } else {
          out[t] = count ?? 0;
        }
      }
      return out;
    },
  });
}

export function AdminResetTool() {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const counts = useTableCounts();
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmSup, setConfirmSup] = useState("");
  const [openSup, setOpenSup] = useState(false);

  const reset = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("finance_reset_test_data", {
        _confirm: confirm,
      });
      if (error) throw error;
      return data as { status: string; deleted: Record<string, number> };
    },
    onSuccess: async (data) => {
      toast.success(t("finance:reset.success"));
      setConfirm("");
      setOpen(false);
      await qc.invalidateQueries();
      // eslint-disable-next-line no-console
      console.info("[finance reset]", data);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  const deleteSuppliers = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "finance_delete_unused_supplier_companies",
        { _confirm: confirmSup },
      );
      if (error) throw error;
      return data as { status: string; deleted: number };
    },
    onSuccess: async (data) => {
      toast.success(t("finance:resetSuppliers.success", { count: data.deleted }));
      setConfirmSup("");
      setOpenSup(false);
      await qc.invalidateQueries();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  const totalRows = counts.data
    ? Object.values(counts.data).reduce((s, n) => s + (n > 0 ? n : 0), 0)
    : 0;

  return (
    <AdminOnly>
      <div className="space-y-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" /> {t("finance:reset.title")}
            </CardTitle>
            <CardDescription>{t("finance:reset.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">
                      {t("finance:reset.table")}
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      {t("finance:reset.rows")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TABLES.map((tName) => {
                    const c = counts.data?.[tName] ?? 0;
                    return (
                      <tr key={tName} className="border-t">
                        <td className="px-3 py-1.5 font-mono text-xs">{tName}</td>
                        <td
                          className={`px-3 py-1.5 text-right tabular-nums ${
                            c > 0 ? "text-destructive font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {counts.isLoading ? "…" : c < 0 ? "?" : c.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td className="px-3 py-2 font-medium">{t("finance:reset.total")}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {totalRows.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="text-xs text-muted-foreground">{t("finance:reset.kept")}</div>

            <AlertDialog open={open} onOpenChange={setOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={totalRows === 0}>
                  <RotateCcw className="size-4 mr-2" />
                  {t("finance:reset.action")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="size-5" /> {t("finance:reset.confirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("finance:reset.confirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                  <Label className="text-xs">
                    {t("finance:reset.typeToConfirm", { phrase: CONFIRM })}
                  </Label>
                  <Input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={CONFIRM}
                    autoFocus
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={reset.isPending}>
                    {t("common:cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction asChild disabled={confirm !== CONFIRM || reset.isPending}>
                    <Button
                      variant="destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm === CONFIRM) reset.mutate();
                      }}
                      disabled={confirm !== CONFIRM || reset.isPending}
                    >
                      {reset.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
                      {t("finance:reset.confirmAction")}
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" /> {t("finance:resetSuppliers.title")}
            </CardTitle>
            <CardDescription>{t("finance:resetSuppliers.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AlertDialog open={openSup} onOpenChange={setOpenSup}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="size-4 mr-2" />
                  {t("finance:resetSuppliers.action")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="size-5" />
                    {t("finance:resetSuppliers.confirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("finance:resetSuppliers.confirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                  <Label className="text-xs">
                    {t("finance:reset.typeToConfirm", { phrase: CONFIRM_SUPPLIERS })}
                  </Label>
                  <Input
                    value={confirmSup}
                    onChange={(e) => setConfirmSup(e.target.value)}
                    placeholder={CONFIRM_SUPPLIERS}
                    autoFocus
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteSuppliers.isPending}>
                    {t("common:cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    asChild
                    disabled={confirmSup !== CONFIRM_SUPPLIERS || deleteSuppliers.isPending}
                  >
                    <Button
                      variant="destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirmSup === CONFIRM_SUPPLIERS) deleteSuppliers.mutate();
                      }}
                      disabled={confirmSup !== CONFIRM_SUPPLIERS || deleteSuppliers.isPending}
                    >
                      {deleteSuppliers.isPending ? (
                        <Loader2 className="size-4 mr-1 animate-spin" />
                      ) : null}
                      {t("finance:resetSuppliers.confirmAction")}
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </AdminOnly>
  );
}
