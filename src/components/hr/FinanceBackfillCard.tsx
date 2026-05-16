import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Database, Loader2, Play, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Preview = {
  eligible: number;
  total_amount: number | string;
  oldest_date: string | null;
  newest_date: string | null;
  with_period: number;
  without_period: number;
};

type RunResult = {
  created: number;
  skipped: number;
  failed: number;
  with_period: number;
  without_period: number;
  failures: Array<{ expense_id: string; sqlstate: string; message: string }>;
};

function fmtEUR(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
}

export function FinanceBackfillCard() {
  const { t, i18n } = useTranslation(["hr"]);
  const dateLocale = i18n.language?.startsWith("en") ? "en-GB" : "pt-PT";
  const qc = useQueryClient();
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  const previewQ = useQuery({
    queryKey: ["benefit-finance-backfill-preview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("benefit_expense_finance_backfill_preview");
      if (error) throw error;
      return data as unknown as Preview;
    },
  });

  const runM = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("benefit_expense_finance_backfill_run");
      if (error) throw error;
      return data as unknown as RunResult;
    },
    onSuccess: (res) => {
      setLastRun(res);
      toast.success(
        t("hr:beneficios.backfill.toastDone", {
          created: res.created,
          skipped: res.skipped,
          failed: res.failed,
        }),
      );
      qc.invalidateQueries({ queryKey: ["benefit-finance-backfill-preview"] });
      qc.invalidateQueries({ queryKey: ["all-expenses"] });
    },
    onError: (e: unknown) => {
      toast.error((e as Error).message);
    },
  });

  const preview = previewQ.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" />
          {t("hr:beneficios.backfill.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("hr:beneficios.backfill.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {previewQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("hr:beneficios.history.loading")}</p>
        ) : preview ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">{t("hr:beneficios.backfill.eligible")}: </span>
              <span className="font-medium">{preview.eligible}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("hr:beneficios.backfill.totalAmount")}: </span>
              <span className="font-medium">{fmtEUR(preview.total_amount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("hr:beneficios.backfill.withPeriod")}: </span>
              <span className="font-medium">{preview.with_period}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("hr:beneficios.backfill.withoutPeriod")}: </span>
              <span className="font-medium">{preview.without_period}</span>
            </div>
            {preview.oldest_date && preview.newest_date && (
              <div className="sm:col-span-2 text-xs text-muted-foreground">
                {t("hr:beneficios.backfill.dateRange", {
                  from: new Date(preview.oldest_date).toLocaleDateString(dateLocale),
                  to: new Date(preview.newest_date).toLocaleDateString(dateLocale),
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => previewQ.refetch()}
            disabled={previewQ.isFetching}
          >
            <RefreshCw className={previewQ.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {t("hr:beneficios.backfill.refreshPreview")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (!preview || preview.eligible === 0) return;
              if (!window.confirm(t("hr:beneficios.backfill.confirm", { count: preview.eligible }))) {
                return;
              }
              runM.mutate();
            }}
            disabled={runM.isPending || !preview || preview.eligible === 0}
          >
            {runM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {t("hr:beneficios.backfill.run")}
          </Button>
        </div>

        {lastRun && (
          <div className="rounded border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {t("hr:beneficios.backfill.summaryTitle")}
            </p>
            <p className="text-muted-foreground mt-1">
              {t("hr:beneficios.backfill.summary", {
                created: lastRun.created,
                skipped: lastRun.skipped,
                failed: lastRun.failed,
              })}
              {" · "}
              {t("hr:beneficios.backfill.summaryPeriods", {
                withPeriod: lastRun.with_period,
                withoutPeriod: lastRun.without_period,
              })}
            </p>
            {lastRun.failures.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-rose-700">
                {lastRun.failures.slice(0, 5).map((f) => (
                  <li key={f.expense_id} className="font-mono truncate">
                    {f.expense_id}: {f.message}
                  </li>
                ))}
                {lastRun.failures.length > 5 && (
                  <li className="text-muted-foreground">
                    +{lastRun.failures.length - 5} more
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
