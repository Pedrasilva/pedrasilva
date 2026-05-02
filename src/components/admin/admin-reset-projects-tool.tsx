/**
 * Admin-only reset tool for project test data.
 *
 * Wipes (after explicit confirmation):
 *   - pm_projects (cascades to pm_stages, pm_allocations, pm_tasks,
 *     pm_time_entries (project), pm_expenses, pm_materials, pm_invoices,
 *     pm_invoice_settings, pm_project_rate_overrides, pm_activities)
 *   - historical_time_entries
 *   - import_jobs (accelo_activity_timesheet) and their import_job_rows
 *
 * Keeps:
 *   - companies / clients / suppliers
 *   - collaborators / HR
 *   - users / permissions / roles
 *   - financial_documents, financial_document_lines, financial_document_payments
 *   - bank_transactions, bank_transaction_classifications
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
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

const CONFIRM = "DELETE TEST PROJECT DATA";

const TABLES = [
  "pm_projects",
  "pm_stages",
  "pm_tasks",
  "pm_time_entries",
  "historical_time_entries",
  "pm_expenses",
  "pm_materials",
  "pm_invoices",
  "import_jobs",
] as const;

function useProjectCounts() {
  return useQuery({
    queryKey: ["admin", "project-reset-counts"],
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (const t of TABLES) {
        let q = supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from(t as any)
          .select("*", { count: "exact", head: true });
        if (t === "pm_time_entries") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          q = (q as any).eq("entry_type", "project");
        }
        if (t === "import_jobs") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          q = (q as any).eq("import_type", "accelo_activity_timesheet");
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count, error } = (await q) as any;
        out[t] = error ? -1 : count ?? 0;
      }
      return out;
    },
  });
}

export function AdminResetProjectsTool() {
  const { t } = useTranslation("common");
  const qc = useQueryClient();
  const counts = useProjectCounts();
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);

  const reset = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("reset_project_test_data", {
        _confirm: confirm,
      });
      if (error) throw error;
      return data as { status: string; deleted: Record<string, number> };
    },
    onSuccess: async (data) => {
      toast.success(t("admin.projectReset.success"));
      setConfirm("");
      setOpen(false);
      await qc.invalidateQueries();
      // eslint-disable-next-line no-console
      console.info("[project reset]", data);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  const total = counts.data
    ? Object.values(counts.data).reduce((s, n) => s + (n > 0 ? n : 0), 0)
    : 0;

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-5" /> {t("admin.projectReset.title")}
        </CardTitle>
        <CardDescription>{t("admin.projectReset.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium">
                  {t("admin.projectReset.table")}
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  {t("admin.projectReset.rows")}
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
                <td className="px-3 py-2 font-medium">{t("admin.projectReset.total")}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {total.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="text-xs text-muted-foreground">{t("admin.projectReset.kept")}</div>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={total === 0}>
              <RotateCcw className="size-4 mr-2" />
              {t("admin.projectReset.action")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="size-5" /> {t("admin.projectReset.confirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("admin.projectReset.confirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-2">
              <Label className="text-xs">
                {t("admin.projectReset.typeToConfirm", { phrase: CONFIRM })}
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
                {t("cancel")}
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
                  {t("admin.projectReset.confirmAction")}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
