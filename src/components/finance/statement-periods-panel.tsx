/**
 * Banking → Reconciliation: numbered statement periods.
 *
 * The user declares a statement ("006/2026") exactly as the bank issued it —
 * number, date range, opening and closing balance. We then compare the
 * declared closing against `opening + sum(reconciled transactions in range)`
 * and flag Confirmed / Mismatch, the same audit pattern used by the manual
 * balance snapshots.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  useStatementPeriods,
  useStatementPeriodStatus,
  type StatementPeriod,
} from "@/lib/finance/use-statement-periods";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

type FormState = {
  statement_number: string;
  period_start_date: string;
  period_end_date: string;
  opening_balance: string;
  closing_balance: string;
  notes: string;
};

const emptyForm: FormState = {
  statement_number: "",
  period_start_date: "",
  period_end_date: "",
  opening_balance: "",
  closing_balance: "",
  notes: "",
};

export function StatementPeriodsPanel({
  accountId,
  selectedPeriodId,
  onSelectPeriod,
}: {
  accountId: string;
  selectedPeriodId?: string | null;
  onSelectPeriod?: (id: string | null) => void;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const periodsQ = useStatementPeriods(accountId);
  const statusQ = useStatementPeriodStatus(accountId);
  const [editing, setEditing] = useState<StatementPeriod | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["finance", "bank-statement-periods"] });
    qc.invalidateQueries({
      queryKey: ["finance", "bank-statement-period-status"],
    });
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(p: StatementPeriod) {
    setEditing(p);
    setForm({
      statement_number: p.statement_number,
      period_start_date: p.period_start_date,
      period_end_date: p.period_end_date,
      opening_balance: String(p.opening_balance),
      closing_balance: String(p.closing_balance),
      notes: p.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.statement_number.trim()) {
      toast.error(t("finance:bankPeriods.numberRequired"));
      return;
    }
    if (!form.period_start_date || !form.period_end_date) {
      toast.error(t("finance:bankPeriods.datesRequired"));
      return;
    }
    const payload = {
      bank_account_id: accountId,
      statement_number: form.statement_number.trim(),
      period_start_date: form.period_start_date,
      period_end_date: form.period_end_date,
      opening_balance: Number(form.opening_balance || 0),
      closing_balance: Number(form.closing_balance || 0),
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    const { error } = editing
      ? await supabase
          .from("bank_statement_periods")
          .update(payload)
          .eq("id", editing.id)
      : await supabase.from("bank_statement_periods").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common:saved"));
    setOpen(false);
    refresh();
  }

  async function remove(p: StatementPeriod) {
    if (!window.confirm(t("finance:bankPeriods.deleteConfirm"))) return;
    const { error } = await supabase
      .from("bank_statement_periods")
      .delete()
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (selectedPeriodId === p.id) onSelectPeriod?.(null);
    refresh();
  }

  const periods = periodsQ.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="text-base">
            {t("finance:bankPeriods.title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("finance:bankPeriods.subtitle")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={startCreate}>
          <Plus className="size-4 mr-1" /> {t("finance:bankPeriods.new")}
        </Button>
      </CardHeader>
      <CardContent>
        {periods.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("finance:bankPeriods.empty")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">
                    {t("finance:bankPeriods.col.number")}
                  </TableHead>
                  <TableHead className="w-[180px]">
                    {t("finance:bankPeriods.col.range")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:bankPeriods.col.declaredOpening")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:bankPeriods.col.declaredClosing")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:bankPeriods.col.computedClosing")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:bankPeriods.col.difference")}
                  </TableHead>
                  <TableHead className="w-[150px]">
                    {t("finance:bankPeriods.col.status")}
                  </TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => {
                  const s = statusQ.byPeriod.get(p.id);
                  const isSelected = selectedPeriodId === p.id;
                  return (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer ${isSelected ? "bg-muted/60" : ""}`}
                      onClick={() =>
                        onSelectPeriod?.(isSelected ? null : p.id)
                      }
                    >
                      <TableCell className="font-medium text-sm">
                        {p.statement_number}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {p.period_start_date} → {p.period_end_date}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmt(p.opening_balance)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmt(p.closing_balance)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {s ? fmt(s.computed_closing) : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm tabular-nums ${
                          s && s.status === "mismatch"
                            ? "text-destructive font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        {s ? fmt(s.difference) : "—"}
                      </TableCell>
                      <TableCell>
                        {s ? (
                          <PeriodStatusBadge
                            status={s.status}
                            reconciled={s.reconciled_count}
                            total={s.tx_count}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => startEdit(p)}
                          aria-label={t("common:edit") as string}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive"
                          onClick={() => remove(p)}
                          aria-label={t("common:delete") as string}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("finance:bankPeriods.edit")
                : t("finance:bankPeriods.new")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("finance:bankPeriods.col.number")}</Label>
              <Input
                placeholder="006/2026"
                value={form.statement_number}
                onChange={(e) =>
                  setForm({ ...form, statement_number: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("finance:bankPeriods.startDate")}</Label>
                <Input
                  type="date"
                  value={form.period_start_date}
                  onChange={(e) =>
                    setForm({ ...form, period_start_date: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>{t("finance:bankPeriods.endDate")}</Label>
                <Input
                  type="date"
                  value={form.period_end_date}
                  onChange={(e) =>
                    setForm({ ...form, period_end_date: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("finance:bankPeriods.col.declaredOpening")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.opening_balance}
                  onChange={(e) =>
                    setForm({ ...form, opening_balance: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>{t("finance:bankPeriods.col.declaredClosing")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.closing_balance}
                  onChange={(e) =>
                    setForm({ ...form, closing_balance: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>{t("finance:bankPeriods.notes")}</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("finance:bankPeriods.declaredHint")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common:cancel")}
            </Button>
            <Button onClick={save} disabled={saving}>
              {t("common:save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function PeriodStatusBadge({
  status,
  reconciled,
  total,
}: {
  status: "confirmed" | "mismatch";
  reconciled: number;
  total: number;
}) {
  const { t } = useTranslation(["finance"]);
  return (
    <div className="flex flex-col gap-0.5">
      <Badge
        variant={status === "confirmed" ? "default" : "destructive"}
        className="w-fit gap-1 text-[10px]"
      >
        {status === "confirmed" ? (
          <CheckCircle2 className="size-3" />
        ) : (
          <AlertTriangle className="size-3" />
        )}
        {t(`finance:bankPeriods.status.${status}`)}
      </Badge>
      <span className="text-[10px] text-muted-foreground">
        {t("finance:bankPeriods.reconciledOf", { reconciled, total })}
      </span>
    </div>
  );
}
