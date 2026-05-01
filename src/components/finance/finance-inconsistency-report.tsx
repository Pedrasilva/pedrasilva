/**
 * Admin-only read-only inconsistency report.
 *
 * Calls the `finance_inconsistency_report` SQL RPC and groups results into
 * three buckets:
 *   1. linked_payment_not_classified — payment links to a bank tx but the
 *      bank tx is still flagged unclassified (trigger should have fixed this)
 *   2. classified_orphan — bank tx marked classified but has no split and no
 *      linked document (manual classification was lost or never written)
 *   3. payment_missing_bank_tx — payment recorded as bank_transfer but with
 *      no bank_transaction_id linked
 *
 * Pure read view: no quick actions yet. Operators get the IDs and enough
 * context to fix manually in the documents/bank screens.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminOnly } from "@/components/AdminOnly";

type LinkedNotClassified = {
  bank_transaction_id: string;
  description: string | null;
  amount: number | null;
  status: string | null;
  document_id: string | null;
};
type ClassifiedOrphan = {
  bank_transaction_id: string;
  description: string | null;
  amount: number | null;
};
type PaymentMissingTx = {
  payment_id: string;
  document_id: string | null;
  amount: number | null;
  payment_date: string | null;
  method: string | null;
};
type Report = {
  linked_payment_not_classified: LinkedNotClassified[];
  classified_orphan: ClassifiedOrphan[];
  payment_missing_bank_tx: PaymentMissingTx[];
  counts: {
    linked_payment_not_classified: number;
    classified_orphan: number;
    payment_missing_bank_tx: number;
  };
};

function fmtAmount(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function ShortId({ id }: { id: string | null | undefined }) {
  if (!id) return <span className="text-muted-foreground">—</span>;
  return (
    <code
      title={id}
      className="font-mono text-[11px] px-1 py-0.5 rounded bg-muted text-muted-foreground"
    >
      {id.slice(0, 8)}
    </code>
  );
}

export function FinanceInconsistencyReport() {
  const { t } = useTranslation(["finance", "common"]);

  const q = useQuery({
    queryKey: ["finance", "inconsistency-report"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "finance_inconsistency_report",
      );
      if (error) throw error;
      return data as Report;
    },
  });

  const total = q.data
    ? q.data.counts.linked_payment_not_classified +
      q.data.counts.classified_orphan +
      q.data.counts.payment_missing_bank_tx
    : 0;

  return (
    <AdminOnly>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {total === 0 && q.data ? (
                <ShieldCheck className="size-4 text-emerald-600" />
              ) : (
                <AlertCircle className="size-4 text-amber-600" />
              )}
              {t("finance:inconsistencies.title")}
              {q.data && (
                <Badge
                  variant={total === 0 ? "secondary" : "destructive"}
                  className="ml-1"
                >
                  {total}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {t("finance:inconsistencies.subtitle")}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            {q.isFetching ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5 mr-1" />
            )}
            {t("common:refresh")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {q.isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {t("common:loading")}
            </div>
          )}
          {q.error && (
            <div className="text-sm text-destructive">
              {q.error instanceof Error ? q.error.message : String(q.error)}
            </div>
          )}
          {q.data && total === 0 && (
            <div className="text-sm text-muted-foreground">
              {t("finance:inconsistencies.allClean")}
            </div>
          )}

          {q.data && q.data.counts.linked_payment_not_classified > 0 && (
            <Bucket
              title={t("finance:inconsistencies.linkedNotClassified.title")}
              description={t(
                "finance:inconsistencies.linkedNotClassified.description",
              )}
              count={q.data.counts.linked_payment_not_classified}
            >
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.bankTx")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.description")}
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.amount")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.status")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.document")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.linked_payment_not_classified.map((r) => (
                    <tr key={r.bank_transaction_id} className="border-t">
                      <td className="px-2 py-1.5">
                        <ShortId id={r.bank_transaction_id} />
                      </td>
                      <td className="px-2 py-1.5 truncate max-w-[280px]">
                        {r.description ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmtAmount(r.amount)}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px]">
                        {r.status ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <ShortId id={r.document_id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bucket>
          )}

          {q.data && q.data.counts.classified_orphan > 0 && (
            <Bucket
              title={t("finance:inconsistencies.classifiedOrphan.title")}
              description={t(
                "finance:inconsistencies.classifiedOrphan.description",
              )}
              count={q.data.counts.classified_orphan}
            >
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.bankTx")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.description")}
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.amount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.classified_orphan.map((r) => (
                    <tr key={r.bank_transaction_id} className="border-t">
                      <td className="px-2 py-1.5">
                        <ShortId id={r.bank_transaction_id} />
                      </td>
                      <td className="px-2 py-1.5 truncate max-w-[280px]">
                        {r.description ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmtAmount(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bucket>
          )}

          {q.data && q.data.counts.payment_missing_bank_tx > 0 && (
            <Bucket
              title={t("finance:inconsistencies.paymentMissingTx.title")}
              description={t(
                "finance:inconsistencies.paymentMissingTx.description",
              )}
              count={q.data.counts.payment_missing_bank_tx}
            >
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.payment")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.document")}
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.amount")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.date")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("finance:inconsistencies.cols.method")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.payment_missing_bank_tx.map((r) => (
                    <tr key={r.payment_id} className="border-t">
                      <td className="px-2 py-1.5">
                        <ShortId id={r.payment_id} />
                      </td>
                      <td className="px-2 py-1.5">
                        <ShortId id={r.document_id} />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmtAmount(r.amount)}
                      </td>
                      <td className="px-2 py-1.5">{r.payment_date ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-[11px]">
                        {r.method ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bucket>
          )}
        </CardContent>
      </Card>
    </AdminOnly>
  );
}

function Bucket({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="destructive">{count}</Badge>
      </header>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="border rounded-md overflow-hidden">{children}</div>
    </section>
  );
}
