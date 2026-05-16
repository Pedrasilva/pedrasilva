import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Loader2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Preview = {
  eligible: number;
  total_amount: number | string;
  oldest_date: string | null;
  newest_date: string | null;
};

type RunResult = {
  created: number;
  skipped: number;
  failed: number;
  failures: Array<{ expense_id: string; sqlstate: string; message: string }>;
};

function fmtEUR(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
}

export function PaymentLedgerBackfillCard() {
  const { t } = useTranslation(["hr"]);
  const qc = useQueryClient();
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  const previewQ = useQuery({
    queryKey: ["fei-payment-backfill-preview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "financial_expense_payment_backfill_preview",
      );
      if (error) throw error;
      return data as unknown as Preview;
    },
  });

  const runM = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "financial_expense_payment_backfill_run",
      );
      if (error) throw error;
      return data as unknown as RunResult;
    },
    onSuccess: (res) => {
      setLastRun(res);
      toast.success(
        t("hr:beneficios.paymentLedgerBackfill.toastDone", {
          created: res.created,
          skipped: res.skipped,
          failed: res.failed,
        }),
      );
      qc.invalidateQueries({ queryKey: ["fei-payment-backfill-preview"] });
      qc.invalidateQueries({ queryKey: ["all-expenses"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const preview = previewQ.data;
  const eligible = preview?.eligible ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4" />
          {t("hr:beneficios.paymentLedgerBackfill.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("hr:beneficios.paymentLedgerBackfill.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {previewQ.isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("hr:beneficios.paymentLedgerBackfill.loading")}
          </p>
        ) : preview ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">
                {t("hr:beneficios.paymentLedgerBackfill.eligible")}:{" "}
              </span>
              <span className="font-medium">{preview.eligible}</span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("hr:beneficios.paymentLedgerBackfill.total")}:{" "}
              </span>
              <span className="font-medium">{fmtEUR(preview.total_amount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("hr:beneficios.paymentLedgerBackfill.oldest")}:{" "}
              </span>
              <span className="font-medium">{preview.oldest_date ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("hr:beneficios.paymentLedgerBackfill.newest")}:{" "}
              </span>
              <span className="font-medium">{preview.newest_date ?? "—"}</span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={eligible === 0 || runM.isPending}>
                {runM.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {t("hr:beneficios.paymentLedgerBackfill.run", { count: eligible })}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("hr:beneficios.paymentLedgerBackfill.confirmTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("hr:beneficios.paymentLedgerBackfill.confirmBody", { count: eligible })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("hr:beneficios.paymentLedgerBackfill.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction onClick={() => runM.mutate()}>
                  {t("hr:beneficios.paymentLedgerBackfill.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {lastRun ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div>
              {t("hr:beneficios.paymentLedgerBackfill.created")}:{" "}
              <span className="font-medium">{lastRun.created}</span>
            </div>
            <div>
              {t("hr:beneficios.paymentLedgerBackfill.skipped")}:{" "}
              <span className="font-medium">{lastRun.skipped}</span>
            </div>
            <div>
              {t("hr:beneficios.paymentLedgerBackfill.failed")}:{" "}
              <span className="font-medium">{lastRun.failed}</span>
            </div>
            {lastRun.failures?.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {t("hr:beneficios.paymentLedgerBackfill.viewFailures")}
                </summary>
                <ul className="mt-1 space-y-1 text-xs">
                  {lastRun.failures.map((f, i) => (
                    <li key={i} className="font-mono">
                      {f.expense_id.slice(0, 8)}… [{f.sqlstate}] {f.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
