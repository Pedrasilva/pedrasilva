import { useState } from "react";
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
        `Backfill concluído — criados: ${res.created}, ignorados: ${res.skipped}, falhas: ${res.failed}`,
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
          Backfill — Ledger de pagamentos
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Cria linhas sintéticas no ledger de pagamentos para reembolsos HR já marcados como pagos no Finance mas sem registo de pagamento.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {previewQ.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : preview ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Elegíveis: </span>
              <span className="font-medium">{preview.eligible}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">{fmtEUR(preview.total_amount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Pagamento mais antigo: </span>
              <span className="font-medium">{preview.oldest_date ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Pagamento mais recente: </span>
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
                Executar backfill ({eligible})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar backfill do ledger</AlertDialogTitle>
                <AlertDialogDescription>
                  Vai criar {eligible} linha(s) sintética(s) no ledger de pagamentos. Sem ligação a movimentos bancários. Operação idempotente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => runM.mutate()}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {lastRun ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div>Criados: <span className="font-medium">{lastRun.created}</span></div>
            <div>Ignorados: <span className="font-medium">{lastRun.skipped}</span></div>
            <div>Falhas: <span className="font-medium">{lastRun.failed}</span></div>
            {lastRun.failures?.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">Ver falhas</summary>
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
