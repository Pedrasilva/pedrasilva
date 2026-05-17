/**
 * Read-only settlement section for purchase/invoice editor dialogs.
 *
 * Lists the `financial_document_payments` already attached to a single
 * document. Bank-transaction details are looked up in a side query (the
 * editor's `useFinDocument` payload only carries payment rows). No
 * reversal/undo here.
 */

import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link2, Link2Off } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { FinDocPayment } from "@/lib/finance/use-documents";

type Props = {
  payments: FinDocPayment[];
  currency?: string;
};

const fmt = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(n);

export function DocumentSettlementSection({ payments, currency = "EUR" }: Props) {
  const { t, i18n } = useTranslation(["finance"]);
  const dateLocale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  const txIds = payments
    .map((p) => p.bank_transaction_id)
    .filter((x): x is string => !!x);

  const banksQ = useQuery({
    queryKey: ["fin-doc-settlement-banks", txIds.sort().join(",")],
    enabled: txIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select(
          "id, transaction_date, description, amount, bank_account:bank_accounts(id, account_name, bank_name)",
        )
        .in("id", txIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bankMap = new Map<string, NonNullable<typeof banksQ.data>[number]>();
  for (const b of banksQ.data ?? []) bankMap.set(b.id, b);

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  if (payments.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("finance:settlement.history.docSection.title")}
        </h3>
        <div className="py-6 text-center text-xs text-muted-foreground border rounded-md">
          {t("finance:settlement.history.docSection.empty")}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("finance:settlement.history.docSection.title")}
        </h3>
        <div className="text-xs text-muted-foreground">
          {t("finance:settlement.history.docSection.totalPaid")}:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {fmt(totalPaid, currency)}
          </span>
        </div>
      </div>
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">
                {t("finance:settlement.history.col.date")}
              </TableHead>
              <TableHead className="text-right w-[130px]">
                {t("finance:settlement.history.col.amount")}
              </TableHead>
              <TableHead className="w-[130px]">
                {t("finance:settlement.history.col.method")}
              </TableHead>
              <TableHead>
                {t("finance:settlement.history.col.bank")}
              </TableHead>
              <TableHead>
                {t("finance:settlement.dialog.notes")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => {
              const bank = p.bank_transaction_id
                ? bankMap.get(p.bank_transaction_id)
                : null;
              return (
                <TableRow key={p.id}>
                  <TableCell className="text-sm tabular-nums">
                    {new Date(p.payment_date).toLocaleDateString(dateLocale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmt(Number(p.amount ?? 0), currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">
                      {t(`finance:settlement.dialog.methods.${p.method}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {bank ? (
                      <div className="flex items-start gap-1.5">
                        <Link2 className="size-3.5 mt-0.5 text-emerald-600 shrink-0" />
                        <div>
                          <div className="font-medium">
                            {bank.bank_account?.account_name ??
                              t("finance:settlement.history.common.unknownAccount")}
                          </div>
                          <div className="text-muted-foreground truncate max-w-[240px]">
                            {new Date(bank.transaction_date).toLocaleDateString(dateLocale)}
                            {" · "}
                            {bank.description}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Link2Off className="size-3.5" />
                        {t("finance:settlement.history.common.notLinked")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {p.notes ?? ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
