/**
 * Version history dialog for the PSA Proposal Composer.
 *
 * Lists snapshots (newest first), lets the user create a labelled snapshot,
 * restore any previous version (a pre-restore snapshot is auto-created so
 * the action is reversible), or delete obsolete entries.
 */
import { useState } from "react";
import { History, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useCreateSnapshot,
  useDeleteSnapshot,
  useProposalSnapshots,
  useRestoreSnapshot,
} from "@/lib/psa-proposal/use-proposal-history";

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `há ${days} d`;
  return d.toLocaleString("pt-PT");
}

export function ProposalHistoryDialog({
  proposalId,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  proposalId: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [label, setLabel] = useState("");
  const list = useProposalSnapshots(open ? proposalId : undefined);
  const create = useCreateSnapshot(proposalId);
  const restore = useRestoreSnapshot(proposalId);
  const del = useDeleteSnapshot(proposalId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            title="Recuperação de autosaves (avançado) — não é o histórico de revisões"
          >
            <History className="mr-1 h-3.5 w-3.5" /> Autosaves
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recuperação de autosaves (avançado)</DialogTitle>
          <DialogDescription>
            Ferramenta de baixo nível para recuperar conteúdo de blocos a
            partir de gravações automáticas. <strong>Não é o histórico de
            revisões</strong> — as revisões enviadas estão no menu
            &quot;Revisões&quot;. Ao restaurar, apenas o conteúdo dos blocos é
            afetado; nenhum dado do orçamento é alterado. A versão atual é
            guardada automaticamente como &quot;Antes de restaurar&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-zinc-500">Nome desta versão (opcional)</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex.: Antes da revisão do cliente"
            />
          </div>
          <Button
            size="sm"
            onClick={() =>
              create.mutate(
                { label: label.trim() || undefined, reason: "manual" },
                {
                  onSuccess: () => {
                    toast.success("Versão guardada");
                    setLabel("");
                  },
                  onError: (e) =>
                    toast.error("Falha ao guardar versão", {
                      description: String((e as Error).message ?? e),
                    }),
                },
              )
            }
            disabled={create.isPending}
          >
            <Save className="mr-1 h-3.5 w-3.5" /> Guardar versão
          </Button>
        </div>

        <ScrollArea className="h-[420px] rounded-md border">
          <ul className="divide-y">
            {(list.data ?? []).map((snap) => {
              const blockCount = Array.isArray(snap.snapshot?.blocks)
                ? snap.snapshot.blocks.length
                : 0;
              return (
                <li key={snap.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {snap.label ?? (
                        <span className="text-zinc-500">
                          {snap.reason === "pre-restore"
                            ? "Antes de restaurar"
                            : snap.reason === "auto"
                              ? "Automático"
                              : "Versão"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {relTime(snap.created_at)} · {blockCount} blocos
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        !confirm(
                          "Restaurar esta versão? A versão atual será guardada automaticamente.",
                        )
                      )
                        return;
                      restore.mutate(snap, {
                        onSuccess: () => toast.success("Versão restaurada"),
                        onError: (e) =>
                          toast.error("Falha ao restaurar", {
                            description: String((e as Error).message ?? e),
                          }),
                      });
                    }}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (!confirm("Apagar esta versão?")) return;
                      del.mutate(snap.id);
                    }}
                    title="Apagar versão"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
            {!list.isLoading && !(list.data?.length) && (
              <li className="px-3 py-6 text-center text-xs text-zinc-500">
                Sem versões guardadas. Guarde a primeira agora.
              </li>
            )}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
