import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Search, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  inspectBackup,
  previewBackupTable,
  searchBackup,
} from "@/lib/backups/backup.functions";

type Props = {
  runId: string | null;
  fileName: string | null;
  onClose: () => void;
};

export function BackupInspectorDialog({ runId, fileName, onClose }: Props) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");

  const inspectFn = useServerFn(inspectBackup);
  const previewFn = useServerFn(previewBackupTable);
  const searchFn = useServerFn(searchBackup);

  const summaryQ = useQuery({
    queryKey: ["backup-inspect", runId],
    queryFn: () => inspectFn({ data: { runId: runId! } }),
    enabled: !!runId,
    staleTime: 5 * 60 * 1000,
  });

  const previewQ = useQuery({
    queryKey: ["backup-preview", runId, selectedTable, tableSearch],
    queryFn: () =>
      previewFn({ data: { runId: runId!, table: selectedTable!, search: tableSearch } }),
    enabled: !!runId && !!selectedTable,
  });

  const searchMut = useMutation({
    mutationFn: (q: string) => searchFn({ data: { runId: runId!, search: q } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const open = !!runId;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelectedTable(null);
          setTableSearch("");
          setGlobalSearch("");
          searchMut.reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Inspecionar backup</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">
            {fileName ?? runId}
          </DialogDescription>
        </DialogHeader>

        {summaryQ.isLoading && (
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A descarregar e descomprimir do Drive…
          </div>
        )}
        {summaryQ.error && (
          <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {(summaryQ.error as Error).message}
          </p>
        )}

        {summaryQ.data && !selectedTable && (
          <div className="space-y-4 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Gerado em</div>
                <div className="font-medium">
                  {summaryQ.data.meta.generated_at
                    ? new Date(summaryQ.data.meta.generated_at).toLocaleString("pt-PT")
                    : "—"}
                </div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Tabelas</div>
                <div className="font-medium">{summaryQ.data.totalTables}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Linhas totais</div>
                <div className="font-medium">
                  {summaryQ.data.totalRows.toLocaleString("pt-PT")}
                </div>
              </div>
            </div>

            {summaryQ.data.meta.errors && summaryQ.data.meta.errors.length > 0 && (
              <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
                <strong>{summaryQ.data.meta.errors.length} tabela(s) com erro durante o dump:</strong>
                <ul className="mt-1 list-inside list-disc">
                  {summaryQ.data.meta.errors.slice(0, 5).map((e) => (
                    <li key={e.table}>
                      <code>{e.table}</code>: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">Procurar em todas as tabelas</div>
              <div className="flex gap-2">
                <Input
                  placeholder="ex: Mastercard, nome de colaborador, número de fatura…"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && globalSearch.trim()) searchMut.mutate(globalSearch);
                  }}
                />
                <Button
                  onClick={() => searchMut.mutate(globalSearch)}
                  disabled={!globalSearch.trim() || searchMut.isPending}
                >
                  {searchMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {searchMut.data && (
                <div className="rounded border bg-muted/40 p-2 text-xs">
                  {searchMut.data.matches.length === 0 ? (
                    <span className="text-muted-foreground">Sem correspondências.</span>
                  ) : (
                    <ul className="space-y-1">
                      {searchMut.data.matches.map((m) => (
                        <li key={m.table} className="flex items-center justify-between">
                          <button
                            className="font-mono text-primary hover:underline"
                            onClick={() => {
                              setTableSearch(globalSearch);
                              setSelectedTable(m.table);
                            }}
                          >
                            {m.table}
                          </button>
                          <Badge variant="secondary">{m.count} correspondência(s)</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Tabelas no backup</div>
              <div className="max-h-[40vh] overflow-y-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b bg-muted/50 text-left text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2">Tabela</th>
                      <th className="px-3 py-2 text-right">Linhas</th>
                      <th className="px-3 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryQ.data.tables.map((t) => (
                      <tr key={t.name} className="border-b last:border-0">
                        <td className="px-3 py-1.5 font-mono text-xs">{t.name}</td>
                        <td className="px-3 py-1.5 text-right">
                          {t.rows.toLocaleString("pt-PT")}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={t.rows === 0}
                            onClick={() => {
                              setTableSearch("");
                              setSelectedTable(t.name);
                            }}
                          >
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {selectedTable && (
          <div className="space-y-3 overflow-hidden">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelectedTable(null)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <code className="text-sm">{selectedTable}</code>
              <Input
                className="ml-auto max-w-xs"
                placeholder="Filtrar nesta tabela…"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
            </div>
            {previewQ.isLoading && (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> A filtrar…
              </div>
            )}
            {previewQ.data && (
              <>
                <div className="text-xs text-muted-foreground">
                  {previewQ.data.matchCount.toLocaleString("pt-PT")} de{" "}
                  {previewQ.data.totalRows.toLocaleString("pt-PT")} linhas
                  {previewQ.data.matchCount > previewQ.data.returned && (
                    <> (primeiras {previewQ.data.returned} mostradas)</>
                  )}
                </div>
                <div className="max-h-[55vh] overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 border-b bg-muted/50 text-left">
                      <tr>
                        {previewQ.data.columns.map((c) => (
                          <th key={c} className="whitespace-nowrap px-2 py-1.5 font-mono">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(JSON.parse(previewQ.data.rowsJson) as Record<string, unknown>[]).map(
                        (r, i) => (
                          <tr key={i} className="border-b last:border-0 align-top">
                            {previewQ.data.columns.map((c) => {
                              const v = r[c];
                              const s =
                                v === null || v === undefined
                                  ? "—"
                                  : typeof v === "object"
                                    ? JSON.stringify(v)
                                    : String(v);
                              return (
                                <td
                                  key={c}
                                  className="max-w-[220px] truncate px-2 py-1 font-mono"
                                  title={s}
                                >
                                  {s.length > 80 ? `${s.slice(0, 80)}…` : s}
                                </td>
                              );
                            })}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
