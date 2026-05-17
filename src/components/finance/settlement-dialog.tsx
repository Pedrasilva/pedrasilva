/**
 * Settlement dialog — multi-document payment/receipt entry.
 *
 * Creates one `financial_document_payments` row per selected document.
 * The DB trigger updates `paid_amount` and `status` automatically; if a
 * `bank_transaction_id` is attached, `useAddFinDocPayment` also flips that
 * bank transaction to `classified` so it stops showing in the unclassified
 * queue (preserves existing reconciliation invariant — no double-classify).
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { toast } from "sonner";
import {
  useAddFinDocPayment,
  type FinDoc,
} from "@/lib/finance/use-documents";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type PaymentMethod = Database["public"]["Enums"]["financial_payment_method"];

const METHODS: PaymentMethod[] = [
  "bank_transfer",
  "cash",
  "card",
  "direct_debit",
  "other",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(n);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type Props = {
  open: boolean;
  direction: "received" | "issued";
  documents: FinDoc[];
  onClose: () => void;
  onSettled: () => void;
};

export function SettlementDialog({
  open,
  direction,
  documents,
  onClose,
  onSettled,
}: Props) {
  const { t } = useTranslation(["finance", "common"]);
  const ns = direction === "received" ? "outflows" : "receipts";

  const [paymentDate, setPaymentDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [bankAccountId, setBankAccountId] = useState<string>("none");
  const [bankTxId, setBankTxId] = useState<string>("none");
  const [notes, setNotes] = useState<string>("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset allocations to full outstanding on open / docs change
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const d of documents) {
      next[d.id] = String(Number(d.outstanding_amount ?? 0).toFixed(2));
    }
    setAllocations(next);
    setBankTxId("none");
  }, [open, documents]);

  const banksQ = useQuery({
    queryKey: ["bank-accounts-active"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, account_name, bank_name, currency")
        .eq("is_active", true)
        .order("account_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const bankTxQ = useQuery({
    queryKey: ["bank-tx-pick", bankAccountId, paymentDate, direction],
    enabled: open && bankAccountId !== "none",
    queryFn: async () => {
      // Pull recent unclassified transactions for the chosen account around
      // the payment date. Sign filter mirrors direction:
      //   issued (we get paid)   → positive
      //   received (we pay)      → negative
      let q = supabase
        .from("bank_transactions")
        .select("id, transaction_date, description, amount, status")
        .eq("bank_account_id", bankAccountId)
        .eq("status", "unclassified")
        .order("transaction_date", { ascending: false })
        .limit(50);
      if (direction === "issued") q = q.gt("amount", 0);
      else q = q.lt("amount", 0);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const addPayment = useAddFinDocPayment();

  const totals = useMemo(() => {
    let outstanding = 0;
    let toSettle = 0;
    for (const d of documents) {
      const out = Number(d.outstanding_amount ?? 0);
      outstanding += out;
      const v = Number(allocations[d.id] ?? "0");
      if (!Number.isNaN(v)) toSettle += v;
    }
    return {
      outstanding: round2(outstanding),
      toSettle: round2(toSettle),
      remaining: round2(outstanding - toSettle),
    };
  }, [documents, allocations]);

  function setAlloc(id: string, raw: string) {
    setAllocations((prev) => ({ ...prev, [id]: raw }));
  }

  function validate(): string | null {
    if (documents.length === 0) return t("finance:settlement.dialog.errNoDocs");
    if (!paymentDate) return t("finance:settlement.dialog.errDate");
    for (const d of documents) {
      const raw = allocations[d.id] ?? "";
      const v = Number(raw);
      if (raw === "" || Number.isNaN(v)) {
        return t("finance:settlement.dialog.errAmountInvalid", {
          number: d.document_number ?? d.id.slice(0, 8),
        });
      }
      if (v <= 0) {
        return t("finance:settlement.dialog.errAmountPositive", {
          number: d.document_number ?? d.id.slice(0, 8),
        });
      }
      const out = Number(d.outstanding_amount ?? 0);
      if (round2(v) > round2(out)) {
        return t("finance:settlement.dialog.errAmountTooHigh", {
          number: d.document_number ?? d.id.slice(0, 8),
          max: fmt(out),
        });
      }
      if (d.status === "cancelled" || d.status === "draft") {
        return t("finance:settlement.dialog.errWrongStatus", {
          number: d.document_number ?? d.id.slice(0, 8),
        });
      }
      if (d.direction !== direction) {
        return t("finance:settlement.dialog.errWrongDirection");
      }
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id ?? null;
      // Sequential insert: each row triggers recalc; doing them in parallel
      // is fine but sequential keeps error attribution simple.
      for (const d of documents) {
        const amount = round2(Number(allocations[d.id]));
        await addPayment.mutateAsync({
          document_id: d.id,
          amount,
          payment_date: paymentDate,
          method,
          bank_transaction_id: bankTxId !== "none" ? bankTxId : null,
          notes: notes.trim() || null,
          created_by: userId,
        });
      }
      toast.success(
        t(`finance:settlement.${ns}.successToast`, {
          count: documents.length,
          amount: fmt(totals.toSettle),
        }),
      );
      onSettled();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t("finance:settlement.dialog.errSubmit", { msg }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(`finance:settlement.${ns}.dialogTitle`)}</DialogTitle>
          <DialogDescription>
            {t(`finance:settlement.${ns}.dialogSubtitle`, {
              count: documents.length,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected docs allocation list */}
          <div className="border rounded-md max-h-[260px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">
                    {t("finance:settlement.dialog.docCol")}
                  </th>
                  <th className="text-right p-2 font-medium w-[140px]">
                    {t("finance:settlement.dialog.outstandingCol")}
                  </th>
                  <th className="text-right p-2 font-medium w-[140px]">
                    {t("finance:settlement.dialog.amountCol")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => {
                  const out = Number(d.outstanding_amount ?? 0);
                  const v = Number(allocations[d.id] ?? "0");
                  const tooHigh = !Number.isNaN(v) && round2(v) > round2(out);
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="p-2">
                        <div className="font-medium">
                          {d.document_number ?? d.counterparty_name_snapshot ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {d.counterparty_name_snapshot ?? ""}
                        </div>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {fmt(out)}
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={allocations[d.id] ?? ""}
                          onChange={(e) => setAlloc(d.id, e.target.value)}
                          className={cn(
                            "h-8 text-right tabular-nums",
                            tooHigh && "border-destructive",
                          )}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals strip */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Stat
              label={t("finance:settlement.dialog.totalOutstanding")}
              value={fmt(totals.outstanding)}
            />
            <Stat
              label={t("finance:settlement.dialog.totalToSettle")}
              value={fmt(totals.toSettle)}
              accent
            />
            <Stat
              label={t("finance:settlement.dialog.totalRemaining")}
              value={fmt(totals.remaining)}
            />
          </div>

          {/* Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("finance:settlement.dialog.paymentDate")}</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("finance:settlement.dialog.method")}</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`finance:settlement.dialog.methods.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("finance:settlement.dialog.bankAccount")}</Label>
              <Select
                value={bankAccountId}
                onValueChange={(v) => {
                  setBankAccountId(v);
                  setBankTxId("none");
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("finance:settlement.dialog.bankAccountNone")}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  <SelectItem value="none">
                    {t("finance:settlement.dialog.bankAccountNone")}
                  </SelectItem>
                  {(banksQ.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.account_name}
                      {b.bank_name ? ` · ${b.bank_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("finance:settlement.dialog.bankTransaction")}</Label>
              <Select
                value={bankTxId}
                onValueChange={(v) => setBankTxId(v)}
                disabled={bankAccountId === "none"}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("finance:settlement.dialog.bankTxNone")}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  <SelectItem value="none">
                    {t("finance:settlement.dialog.bankTxNone")}
                  </SelectItem>
                  {(bankTxQ.data ?? []).map((tx) => (
                    <SelectItem key={tx.id} value={tx.id}>
                      <span className="tabular-nums">
                        {tx.transaction_date}
                      </span>{" "}
                      · {fmt(Number(tx.amount))} ·{" "}
                      <span className="text-muted-foreground">
                        {tx.description.slice(0, 40)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t("finance:settlement.dialog.notes")}</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  t("finance:settlement.dialog.notesPlaceholder") as string
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            <X className="size-4 mr-1" />
            {t("common:cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Save className="size-4 mr-1" />
            )}
            {t(`finance:settlement.${ns}.confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          accent && "text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}
