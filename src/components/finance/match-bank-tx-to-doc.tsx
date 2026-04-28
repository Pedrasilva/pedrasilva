/**
 * Bank-side "Match to financial document" dialog.
 *
 * Inserts into `financial_document_payments` only — never updates
 * `bank_transactions`. Respects partial payments: prefilled with
 * min(|tx.amount|, doc.outstanding_amount) but editable.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
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
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAddFinDocPayment, type FinDoc } from "@/lib/finance/use-documents";
import { useAuth } from "@/hooks/use-auth";

type BankTxLite = {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
};

type Props = {
  tx: BankTxLite;
  onClose: () => void;
  onMatched?: () => void;
};

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

export function MatchBankTxToDocDialog({ tx, onClose, onMatched }: Props) {
  const { t } = useTranslation(["finance", "common"]);
  const { user } = useAuth();
  const wantIssued = tx.amount > 0; // money in -> issued (client) invoices

  // Outstanding documents matching the sign of the transaction
  const docsQ = useQuery({
    queryKey: ["fin-docs-outstanding", wantIssued ? "issued" : "received"],
    queryFn: async (): Promise<FinDoc[]> => {
      const { data, error } = await supabase
        .from("financial_documents")
        .select("*")
        .eq("direction", wantIssued ? "issued" : "received")
        .neq("status", "cancelled")
        .neq("status", "paid")
        .order("issue_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as FinDoc[]).filter(
        (d) => Number(d.outstanding_amount ?? 0) > 0,
      );
    },
  });

  const [docId, setDocId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const selectedDoc = useMemo(
    () => (docsQ.data ?? []).find((d) => d.id === docId) ?? null,
    [docsQ.data, docId],
  );

  // Prefill amount when a doc is picked
  useEffect(() => {
    if (selectedDoc) {
      const outstanding = Number(selectedDoc.outstanding_amount ?? 0);
      const txAbs = Math.abs(tx.amount);
      setAmount(Math.min(outstanding, txAbs).toFixed(2));
    }
  }, [selectedDoc, tx.amount]);

  const addPayment = useAddFinDocPayment();

  async function save() {
    if (!selectedDoc) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t("finance:documents.payments.exceedsOutstanding"));
      return;
    }
    const outstanding = Number(selectedDoc.outstanding_amount ?? 0);
    if (amt > outstanding + 0.005) {
      toast.error(t("finance:documents.payments.exceedsOutstanding"));
      return;
    }
    try {
      await addPayment.mutateAsync({
        document_id: selectedDoc.id,
        bank_transaction_id: tx.id,
        amount: amt,
        payment_date: tx.transaction_date,
        method: "bank_transfer",
        created_by: user?.id ?? null,
      });
      toast.success(t("finance:documents.bankMatch.matched"));
      onMatched?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("finance:documents.bankMatch.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("finance:documents.bankMatch.subtitle")}
          </p>

          <div className="rounded-md border p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("finance:bankRec.col.date")}
              </span>
              <span>{fmtDate(tx.transaction_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("finance:bankRec.col.description")}
              </span>
              <span className="truncate max-w-[60%]" title={tx.description}>
                {tx.description}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("finance:documents.bankMatch.txAmount")}
              </span>
              <span className="tabular-nums font-medium">
                {fmtEUR(tx.amount)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("finance:documents.bankMatch.documentLabel")}</Label>
            {(docsQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("finance:documents.bankMatch.noCandidates")}
              </p>
            ) : (
              <Select value={docId} onValueChange={setDocId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("finance:documents.bankMatch.pickDocument") as string}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(docsQ.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {(d.document_number ?? "—") +
                        " · " +
                        (d.counterparty_name_snapshot ?? "—") +
                        " · " +
                        fmtEUR(Number(d.outstanding_amount ?? 0))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedDoc && (
            <div className="space-y-2">
              <Label>{t("finance:documents.payments.amount")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="max-w-[180px]"
                />
                <Badge variant="outline" className="text-xs">
                  {t("finance:documents.payments.outstandingHint", {
                    amount: fmtEUR(Number(selectedDoc.outstanding_amount ?? 0)),
                  })}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAmount(Math.abs(tx.amount).toFixed(2))
                  }
                >
                  {t("finance:documents.bankMatch.useAmount")}
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common:cancel")}
          </Button>
          <Button
            onClick={save}
            disabled={!selectedDoc || addPayment.isPending}
          >
            {t("common:save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
