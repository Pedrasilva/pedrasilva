import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CloudUpload, FolderTree, Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { getDriveArchiveConfig, previewDriveSync, runDriveSync } from "@/lib/hr/drive-sync.functions";

function fmtEUR(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v ?? 0);
}

export function BenefitDriveSyncCard() {
  const { t } = useTranslation(["hr"]);
  const qc = useQueryClient();
  const previewFn = useServerFn(previewDriveSync);
  const runFn = useServerFn(runDriveSync);
  const cfgFn = useServerFn(getDriveArchiveConfig);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cfgQ = useQuery({
    queryKey: ["benefit-drive-archive-config"],
    queryFn: () => cfgFn(),
  });

  const previewQ = useQuery({
    queryKey: ["benefit-drive-sync-preview"],
    queryFn: () => previewFn(),
  });

  const runM = useMutation({
    mutationFn: () => runFn({ data: {} }),
    onSuccess: (res) => {
      toast.success(
        t("hr:beneficios.driveSync.toastDone", {
          created: res.created,
          skipped: res.skipped,
          failed: res.failed,
          defaultValue: `Done: ${res.created} uploaded · ${res.skipped} skipped · ${res.failed} failed`,
        }),
      );
      if (res.failures?.length) {
        for (const f of res.failures.slice(0, 3)) {
          toast.error(`${f.expense_id.slice(0, 8)}: ${f.message}`);
        }
      }
      qc.invalidateQueries({ queryKey: ["benefit-drive-sync-preview"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const p = previewQ.data;
  const stats = useMemo(() => p?.totals, [p]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CloudUpload className="h-4 w-4" />
          {t("hr:beneficios.driveSync.title", { defaultValue: "Arquivo Google Drive — Recibos" })}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("hr:beneficios.driveSync.subtitle", {
            defaultValue:
              "Cópia arquivada dos recibos aprovados/pagos para o Google Drive. Supabase continua a ser a fonte da verdade.",
          })}
        </p>
        {cfgQ.data && (
          <div className="rounded border bg-muted/30 p-2 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium">
              <FolderTree className="h-3 w-3" />
              {cfgQ.data.mode === "rootFolder" && (
                <span>
                  Arquivo: <span className="font-mono">Shared Drive · root folder {cfgQ.data.rootFolderId?.slice(0, 8)}…</span> / HR Benefits / {"{year}"} / {"{colab}"} / …
                </span>
              )}
              {cfgQ.data.mode === "sharedDrive" && (
                <span>
                  Arquivo: <span className="font-mono">Shared Drive {cfgQ.data.sharedDriveId?.slice(0, 8)}…</span> / {cfgQ.data.rootName} / HR Benefits / {"{year}"} / …
                </span>
              )}
              {cfgQ.data.mode === "myDrive" && (
                <span>
                  Arquivo: <span className="font-mono">My Drive (conta do conector)</span> / PSA Hub / HR Benefits / {"{year}"} / …
                </span>
              )}
            </div>
            {cfgQ.data.mode === "myDrive" ? (
              <p className="text-amber-700">
                Aviso: ficheiros pertencem à conta Google ligada ao conector. Para resiliência, configure
                <span className="font-mono"> GOOGLE_DRIVE_ARCHIVE_ROOT_FOLDER_ID</span> com uma pasta dentro
                de uma Shared Drive da empresa (ex.: <span className="font-mono">PSA Hub Archive</span>),
                partilhada com a conta do conector com acesso de escrita. Ficheiros já arquivados em My Drive
                permanecem onde estão — só novos sync vão para a Shared Drive.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Conector OAuth (utilizador). Service account / domain-wide delegation continua como melhoria futura.
              </p>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {previewQ.isLoading ? (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
            {t("hr:beneficios.history.loading", { defaultValue: "A carregar…" })}
          </p>
        ) : previewQ.isError ? (
          <p className="text-sm text-destructive">{(previewQ.error as Error).message}</p>
        ) : stats ? (
          <>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label={t("hr:beneficios.driveSync.eligible", { defaultValue: "Elegíveis (aprovadas/pagas)" })}
                value={stats.eligible}
              />
              <Stat
                label={t("hr:beneficios.driveSync.eligibleWithReceipt", { defaultValue: "Com recibo" })}
                value={stats.eligible_with_receipt}
              />
              <Stat
                label={t("hr:beneficios.driveSync.alreadySynced", { defaultValue: "Já sincronizados" })}
                value={stats.already_synced}
                tone="success"
              />
              <Stat
                label={t("hr:beneficios.driveSync.toUpload", { defaultValue: "A carregar agora" })}
                value={stats.pending_upload}
                tone="primary"
              />
              <Stat
                label={t("hr:beneficios.driveSync.previousFailures", { defaultValue: "Falhas anteriores" })}
                value={stats.previous_failures}
                tone={stats.previous_failures > 0 ? "warning" : undefined}
              />
              <Stat
                label={t("hr:beneficios.driveSync.skipped", { defaultValue: "Ignorados (pendentes/rejeitadas/sem recibo)" })}
                value={stats.skipped_non_eligible + stats.skipped_no_receipt}
              />
            </div>

            {p && p.to_upload.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {t("hr:beneficios.driveSync.previewList", {
                    count: p.to_upload.length,
                    defaultValue: `Pré-visualizar ${p.to_upload.length} ficheiros a carregar`,
                  })}
                </summary>
                <ul className="mt-2 max-h-48 overflow-auto space-y-1 rounded border p-2 font-mono">
                  {p.to_upload.slice(0, 50).map((it) => (
                    <li key={it.expense_id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {it.data_despesa} · {it.collaborator_name} · {it.categoria}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{fmtEUR(it.valor)}</span>
                    </li>
                  ))}
                  {p.to_upload.length > 50 && (
                    <li className="text-muted-foreground">
                      … +{p.to_upload.length - 50}
                    </li>
                  )}
                </ul>
              </details>
            )}

            {p && p.failed_previous.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t("hr:beneficios.driveSync.failedList", {
                    count: p.failed_previous.length,
                    defaultValue: `${p.failed_previous.length} com falhas anteriores (serão reentregues)`,
                  })}
                </summary>
                <ul className="mt-2 max-h-32 overflow-auto space-y-1 rounded border p-2">
                  {p.failed_previous.slice(0, 20).map((it) => (
                    <li key={it.expense_id}>
                      <Badge variant="outline" className="mr-1">{it.attempts}x</Badge>
                      {it.expense_id.slice(0, 8)} — {it.last_error?.slice(0, 120)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => previewQ.refetch()}
            disabled={previewQ.isFetching}
          >
            <RefreshCw className={previewQ.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {t("hr:beneficios.driveSync.refreshPreview", { defaultValue: "Recalcular pré-visualização" })}
          </Button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                disabled={!stats || stats.pending_upload === 0 || runM.isPending}
              >
                {runM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
                {t("hr:beneficios.driveSync.runBtn", {
                  count: stats?.pending_upload ?? 0,
                  defaultValue: `Sincronizar ${stats?.pending_upload ?? 0} agora`,
                })}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("hr:beneficios.driveSync.confirmTitle", { defaultValue: "Confirmar sincronização" })}
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    {t("hr:beneficios.driveSync.confirmBody", {
                      count: stats?.pending_upload ?? 0,
                      defaultValue: `Vai carregar ${stats?.pending_upload ?? 0} ficheiros para o Google Drive. Operação idempotente — pode ser repetida com segurança.`,
                    })}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("hr:beneficios.driveSync.confirmNote", {
                      defaultValue:
                        "Os ficheiros são copiados para a conta Google ligada ao conector. Nenhum ficheiro é apagado do Supabase ou do Drive.",
                    })}
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("common:cancel", { defaultValue: "Cancelar" })}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirmOpen(false);
                    runM.mutate();
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {t("hr:beneficios.driveSync.confirmRun", { defaultValue: "Sim, sincronizar" })}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "success" | "warning";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-foreground";
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
