import { translateError } from '@/lib/translate-error';
import uiI18n from "@/i18n/index";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from '@/lib/toast';
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { groupInvoices, isGroupable, type GroupableItem } from "@/lib/quotes/invoice-grouping";

type Kind = "quote" | "project";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Toggle + window for grouping nearby planned invoices. Live projects confirm a preview first. */
export function InvoiceGroupingControl({ kind, id, disabled = false }: { kind: Kind; id: string; disabled?: boolean }) {
  const { t } = useTranslation("common");
  const qc = useQueryClient();
  const parent = kind === "quote" ? "fee_proposals" : "pm_projects";
  const items = kind === "quote" ? "quote_payment_schedule_items" : "pm_payment_schedule_items";
  const col = kind === "quote" ? "quote_id" : "project_id";
  const [preview, setPreview] = useState<{ before: number; after: number; total: number; days: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const q = useQuery({
    queryKey: ["invoice-grouping", kind, id],
    queryFn: async () => {
      const { data, error } = await db.from(parent).select("invoice_grouping_enabled,invoice_grouping_days").eq("id", id).single();
      if (error) throw error;
      return data as { invoice_grouping_enabled: boolean | null; invoice_grouping_days: number };
    },
  });

  const save = async (patch: { invoice_grouping_enabled?: boolean; invoice_grouping_days?: number }) => {
    setSaving(true);
    try {
      const { error } = await db.from(parent).update(patch).eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? translateError(e.message) : String(e));
    } finally {
      setSaving(false);
    }
  };

  const enable = async (days: number) => {
    if (kind === "quote") return save({ invoice_grouping_enabled: true, invoice_grouping_days: days });
    const { data, error } = await db.from(items)
      .select("id,expected_invoice_date,original_invoice_date,payment_terms,vat_rate,billing_status,direction,amount_value")
      .eq(col, id);
    if (error) return toast.error(translateError(error.message));
    const rows = (data ?? []) as Array<GroupableItem & { amount_value: number | null }>;
    const planned = rows.filter(isGroupable);
    const after = groupInvoices(planned, days).length;
    const total = rows.filter((r) => (r.direction ?? "inflow") === "inflow").reduce((s, r) => s + (Number(r.amount_value) || 0), 0);
    setPreview({ before: planned.length, after, total, days });
  };

  const enabled = !!q.data?.invoice_grouping_enabled;
  const days = q.data?.invoice_grouping_days ?? 7;
  const fmt = (n: number) => new Intl.NumberFormat(uiI18n.language, { style: "currency", currency: "EUR" }).format(n);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Switch
          id={`grp-${id}`}
          checked={enabled}
          disabled={disabled || saving || !q.data}
          onCheckedChange={(v) => (v ? enable(days) : save({ invoice_grouping_enabled: false }))}
        />
        <Label htmlFor={`grp-${id}`} className="text-sm">{t("invoiceGrouping.toggle")}</Label>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">{t("invoiceGrouping.days")}</Label>
        <Input
          key={days}
          type="number"
          min={0}
          max={60}
          className="h-8 w-16"
          defaultValue={days}
          disabled={disabled || saving || !q.data}
          onBlur={(e) => {
            const n = Math.round(Number(e.target.value));
            if (!Number.isFinite(n) || n < 0 || n > 60 || n === days) return;
            if (enabled && kind === "project") void enable(n);
            else void save({ invoice_grouping_days: n });
          }}
        />
      </div>
      <p className="w-full text-xs text-muted-foreground">{t("invoiceGrouping.hint", { days })}</p>
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("invoiceGrouping.previewTitle")}</DialogTitle></DialogHeader>
          {preview && <p className="text-sm">{t("invoiceGrouping.previewBody", { before: preview.before, after: preview.after, total: fmt(preview.total) })}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>{t("cancel")}</Button>
            <Button disabled={saving} onClick={async () => {
              const d = preview!.days; setPreview(null);
              await save({ invoice_grouping_enabled: true, invoice_grouping_days: d });
            }}>{t("invoiceGrouping.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
