import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProjectInvoices } from "@/lib/projects/use-invoices";
import type { ProjectExpenseWithSupplier } from "@/lib/projects/use-project-expenses";

const NONE = "__none__";

interface Props {
  projectId: string;
  expense: ProjectExpenseWithSupplier | null;
  onOpenChange: (open: boolean) => void;
}

export function MarkExpenseInvoicedDialog({ projectId, expense, onOpenChange }: Props) {
  const { t } = useTranslation("projects");
  const qc = useQueryClient();
  const { data: invoices = [] } = useProjectInvoices(projectId);
  const [reference, setReference] = useState("");
  const [invoiceId, setInvoiceId] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setReference("");
      setInvoiceId(NONE);
    }
  }, [expense]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!expense) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("pm_expenses")
        .update({
          invoiced_at: new Date().toISOString(),
          invoice_reference: reference.trim() || null,
          invoiced_in_invoice_id: invoiceId === NONE ? null : invoiceId,
        })
        .eq("id", expense.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["project-expenses", projectId] });
      qc.invalidateQueries({ queryKey: ["project-insights", projectId] });
      toast.success(t("expenses.invoiceDialog.done"));
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!expense} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("expenses.invoiceDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("expenses.invoiceDialog.description", { name: expense?.description ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-ref">{t("expenses.invoiceDialog.reference")}</Label>
            <Input
              id="inv-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("expenses.invoiceDialog.referencePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-link">{t("expenses.invoiceDialog.link")}</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger id="inv-link">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("expenses.invoiceDialog.noLink")}</SelectItem>
                {invoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {[inv.invoice_number, inv.raised_date].filter(Boolean).join(" · ") || inv.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("expenses.invoiceDialog.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {t("expenses.invoiceDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
