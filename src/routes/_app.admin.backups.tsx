import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminOnly } from "@/components/AdminOnly";
import { BackupInspectorDialog } from "@/components/admin/backup-inspector-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Database, FolderOpen, Loader2, Eye } from "lucide-react";
import {
  getBackupConfig,
  listBackupRuns,
  runManualBackup,
} from "@/lib/backups/backup.functions";

export const Route = createFileRoute("/_app/admin/backups")({
  component: BackupsPage,
});

function formatBytes(n: number | null | undefined) {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "bg-blue-100 text-blue-800",
    success: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };
  return <Badge className={map[status] ?? ""}>{status}</Badge>;
}

function BackupsPage() {
  const qc = useQueryClient();
  const configFn = useServerFn(getBackupConfig);
  const listFn = useServerFn(listBackupRuns);
  const runFn = useServerFn(runManualBackup);

  const configQ = useQuery({ queryKey: ["backup-config"], queryFn: () => configFn() });
  const runsQ = useQuery({ queryKey: ["backup-runs"], queryFn: () => listFn() });

  const runMut = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (r) => {
      toast.success(`Backup criado: ${r.tables} tabelas, ${r.rows} linhas (${formatBytes(r.sizeBytes)})`);
      qc.invalidateQueries({ queryKey: ["backup-runs"] });
    },
    onError: (e: Error) => toast.error(`Falhou: ${e.message}`),
  });

  const cfg = configQ.data;

  return (
    <AdminOnly>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Database className="h-6 w-6" /> Backups
          </h1>
          <p className="text-sm text-muted-foreground">
            Cópias de segurança de toda a base de dados, enviadas para Google Drive. Diárias automáticas (03:00 UTC), semanais ao domingo e manuais a qualquer momento.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuração</CardTitle>
            <CardDescription>
              Pasta de destino no Google Drive e estado do conector.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Google Drive connector</span>
              <Badge variant={cfg?.driveConnector ? "default" : "destructive"}>
                {cfg?.driveConnector ? "Ligado" : "Não ligado"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Pasta de destino</span>
              {cfg?.configured && cfg.driveFolderUrl ? (
                <a
                  href={cfg.driveFolderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Abrir pasta <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <Badge variant="destructive">Não configurada</Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span>Tabelas incluídas</span>
              <span className="font-mono">{cfg?.tables.length ?? 0}</span>
            </div>
            {!cfg?.configured && (
              <p className="rounded border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
                Para activar os backups, peça ao agente para guardar o ID da pasta do Google Drive no secret <code>BACKUP_DRIVE_FOLDER_ID</code>.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Criar backup agora</CardTitle>
              <CardDescription>
                Gera um snapshot imediato de todas as tabelas e envia para o Drive.
              </CardDescription>
            </div>
            <Button
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending || !cfg?.configured || !cfg?.driveConnector}
            >
              {runMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="mr-2 h-4 w-4" />
              )}
              {runMut.isPending ? "A criar…" : "Criar backup"}
            </Button>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Histórico</CardTitle>
              <CardDescription>Últimos 200 backups (auditoria completa).</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: ["backup-runs"] })}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Quando</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Tabelas</th>
                    <th className="py-2 pr-4">Linhas</th>
                    <th className="py-2 pr-4">Tamanho</th>
                    <th className="py-2 pr-4">Drive</th>
                  </tr>
                </thead>
                <tbody>
                  {runsQ.isLoading && (
                    <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">A carregar…</td></tr>
                  )}
                  {!runsQ.isLoading && (runsQ.data?.length ?? 0) === 0 && (
                    <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Sem backups ainda.</td></tr>
                  )}
                  {runsQ.data?.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">
                        {new Date(r.started_at).toLocaleString("pt-PT")}
                      </td>
                      <td className="py-2 pr-4">{r.trigger}</td>
                      <td className="py-2 pr-4"><StatusBadge status={r.status} /></td>
                      <td className="py-2 pr-4">{r.tables_count ?? "—"}</td>
                      <td className="py-2 pr-4">{r.rows_count?.toLocaleString("pt-PT") ?? "—"}</td>
                      <td className="py-2 pr-4">{formatBytes(r.size_bytes)}</td>
                      <td className="py-2 pr-4">
                        {r.drive_url ? (
                          <a
                            href={r.drive_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            Abrir <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : r.error ? (
                          <span className="text-xs text-red-600" title={r.error}>
                            {r.error.slice(0, 40)}…
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminOnly>
  );
}
