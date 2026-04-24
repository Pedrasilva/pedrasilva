/**
 * Quote Payment Schedule tab — planned forecast payments.
 * No invoice generation yet (Phase D).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  useQuotePaymentSchedule,
  useUpsertQuotePaymentItem,
  useDeleteQuotePaymentItem,
} from "@/lib/quotes/use-quote-payment-schedule";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import {
  QUOTE_PAYMENT_TRIGGERS, QUOTE_PAYMENT_AMOUNT_TYPES,
  type QuotePaymentTrigger, type QuotePaymentAmountType,
} from "@/lib/quotes/types";
import { formatEUR } from "@/lib/crm/types";

export function QuotePaymentScheduleTab({ quoteId }: { quoteId: string }) {
  const { t } = useTranslation("crm");
  const itemsQ = useQuotePaymentSchedule(quoteId);
  const stagesQ = useQuoteStages(quoteId);
  const upsert = useUpsertQuotePaymentItem(quoteId);
  const remove = useDeleteQuotePaymentItem(quoteId);
  const items = itemsQ.data ?? [];
  const stages = stagesQ.data ?? [];

  const [draft, setDraft] = useState({
    label: "",
    trigger_type: "stage_end" as QuotePaymentTrigger,
    stage_id: "",
    amount_type: "percent" as QuotePaymentAmountType,
    amount_value: "0",
    expected_invoice_date: "",
    expected_payment_date: "",
  });

  const stageRequired =
    draft.trigger_type === "stage_start" || draft.trigger_type === "stage_end";
  const dateRequired = draft.trigger_type === "manual_date";

  const handleAdd = async () => {
    if (!draft.label.trim()) return toast.error(t("workspace.payment.errorLabel"));
    if (stageRequired && !draft.stage_id)
      return toast.error(t("workspace.payment.errorStage"));
    if (dateRequired && !draft.expected_invoice_date)
      return toast.error(t("workspace.payment.errorDate"));
    try {
      await upsert.mutateAsync({
        quote_id: quoteId,
        label: draft.label.trim(),
        trigger_type: draft.trigger_type,
        stage_id: stageRequired ? draft.stage_id : null,
        amount_type: draft.amount_type,
        amount_value: Number(draft.amount_value) || 0,
        expected_invoice_date: draft.expected_invoice_date || null,
        expected_payment_date: draft.expected_payment_date || null,
        sort_order: items.length,
      });
      setDraft({
        label: "", trigger_type: "stage_end", stage_id: "",
        amount_type: "percent", amount_value: "0",
        expected_invoice_date: "", expected_payment_date: "",
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    upsert.mutate({ id: a.id, sort_order: b.sort_order });
    upsert.mutate({ id: b.id, sort_order: a.sort_order });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.payment.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>{t("workspace.payment.label")}</TableHead>
                <TableHead>{t("workspace.payment.trigger")}</TableHead>
                <TableHead>{t("common.stage")}</TableHead>
                <TableHead className="text-right">{t("workspace.payment.amount")}</TableHead>
                <TableHead>{t("workspace.payment.invoiceDate")}</TableHead>
                <TableHead>{t("workspace.payment.paymentDate")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, i) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Button variant="ghost" size="sm" className="h-5 p-0" onClick={() => move(i, -1)}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 p-0" onClick={() => move(i, 1)}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{it.label}</TableCell>
                  <TableCell>
                    {QUOTE_PAYMENT_TRIGGERS.find((x) => x.value === it.trigger_type)?.label}
                  </TableCell>
                  <TableCell>
                    {it.stage_id ? stages.find((s) => s.id === it.stage_id)?.name ?? "—" : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.amount_type === "percent"
                      ? `${Number(it.amount_value)}%`
                      : formatEUR(Number(it.amount_value))}
                  </TableCell>
                  <TableCell>{it.expected_invoice_date ?? "—"}</TableCell>
                  <TableCell>{it.expected_payment_date ?? "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(it.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                    {t("workspace.payment.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.payment.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-3">
            <Label>{t("workspace.payment.label")}</Label>
            <Input
              value={draft.label}
              onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              placeholder={t("workspace.payment.labelPlaceholder")}
            />
          </div>
          <div>
            <Label>{t("workspace.payment.trigger")}</Label>
            <Select
              value={draft.trigger_type}
              onValueChange={(v) => setDraft((p) => ({ ...p, trigger_type: v as QuotePaymentTrigger }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUOTE_PAYMENT_TRIGGERS.map((x) => (
                  <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {stageRequired && (
            <div>
              <Label>{t("common.stage")} *</Label>
              <Select
                value={draft.stage_id}
                onValueChange={(v) => setDraft((p) => ({ ...p, stage_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{t("workspace.payment.amountType")}</Label>
            <Select
              value={draft.amount_type}
              onValueChange={(v) => setDraft((p) => ({ ...p, amount_type: v as QuotePaymentAmountType }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUOTE_PAYMENT_AMOUNT_TYPES.map((x) => (
                  <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("workspace.payment.amount")}</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.amount_value}
              onChange={(e) => setDraft((p) => ({ ...p, amount_value: e.target.value }))}
            />
          </div>
          <div>
            <Label>
              {t("workspace.payment.invoiceDate")}{dateRequired && " *"}
            </Label>
            <Input
              type="date"
              value={draft.expected_invoice_date}
              onChange={(e) => setDraft((p) => ({ ...p, expected_invoice_date: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("workspace.payment.paymentDate")}</Label>
            <Input
              type="date"
              value={draft.expected_payment_date}
              onChange={(e) => setDraft((p) => ({ ...p, expected_payment_date: e.target.value }))}
            />
          </div>
          <div className="md:col-span-3 flex justify-end border-t pt-4">
            <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> {t("common.create")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
