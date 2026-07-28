/**
 * 3-pane shell: library (L) · canvas (C) · settings (R) + top bar.
 * Owns the selected-block state.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ComposerTopBar } from "./composer-top-bar";
import { ComposerCanvas } from "./canvas";
import { BlockLibraryPanel } from "./block-library-panel";
import { BlockSettingsPanel } from "./block-settings-panel";
import {
  useProposal,
  useProposalBlocks,
  useReorderBlocks,
  useUpdateProposal,
} from "@/lib/psa-proposal/use-psa-proposal";

export function ComposerShell({ proposalId }: { proposalId: string }) {
  const { t } = useTranslation("common");
  const proposal = useProposal(proposalId);
  const blocks = useProposalBlocks(proposalId);
  const reorder = useReorderBlocks(proposalId);
  const update = useUpdateProposal(proposalId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const canvasScrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!previewMode) return;
    canvasScrollerRef.current?.scrollTo({ top: 0, left: 0 });
  }, [previewMode]);

  const items = useMemo(() => blocks.data ?? [], [blocks.data]);
  const selected = items.find((b) => b.id === selectedId) ?? null;

  if (!proposal.data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        A carregar proposta...
      </div>
    );
  }

  const isFinalLocked = !!proposal.data.locked_at; // won / lost
  const isSentLocked = !isFinalLocked && proposal.data.status === "sent";
  const isReadOnly = isFinalLocked || isSentLocked;

  const startNewRevision = () => {
    update.mutate(
      { status: "draft" },
      {
        onSuccess: () =>
          toast.success(
            "Nova revisão editável — a próxima versão será registada ao enviar.",
          ),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Erro"),
      },
    );
  };

  const guardEdit = () => {
    if (isFinalLocked) {
      toast.error("Proposta bloqueada — não é possível editar.");
      return;
    }
    if (isSentLocked) {
      toast.message("Versão enviada bloqueada.", {
        description:
          "Cria uma nova revisão para continuar a editar. As revisões enviadas mantêm-se intactas.",
        action: {
          label: "Nova revisão",
          onClick: startNewRevision,
        },
      });
    }
  };

  return (
    <div className={`flex h-[calc(100vh-3.5rem)] flex-col ${previewMode ? "psa-preview-mode" : ""}`}>
      <ComposerTopBar
        proposal={proposal.data}
        blocks={items}
        previewMode={previewMode}
        onTogglePreview={() => setPreviewMode((v) => !v)}
      />
      {previewMode && (
        <div className="flex shrink-0 items-center border-b bg-background px-4 py-2 print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(false)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("proposalComposer.pagination.backToBuilder")}
          </Button>
        </div>
      )}
      {isFinalLocked && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 print:hidden">
          Proposta bloqueada
          {proposal.data.outcome === "won"
            ? " (Ganha)"
            : proposal.data.outcome === "lost"
              ? " (Perdida)"
              : ""}
          . O conteúdo dos blocos está protegido; podes continuar a
          descarregar as revisões enviadas em qualquer altura.
        </div>
      )}
      {isSentLocked && (
        <div className="flex items-center justify-between gap-3 border-b border-sky-300 bg-sky-50 px-4 py-2 text-xs text-sky-900 print:hidden">
          <span>
            Versão enviada bloqueada. Para alterar qualquer campo, cria uma
            nova revisão — a versão enviada anterior mantém-se intacta no
            histórico.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-sky-400 bg-white text-sky-900 hover:bg-sky-100"
            onClick={startNewRevision}
          >
            <FilePlus2 className="mr-1 h-3.5 w-3.5" /> Nova revisão
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden print:block">
        {!isReadOnly && !previewMode && (
          <div className="print:hidden">
            <BlockLibraryPanel proposalId={proposalId} blocks={items} quoteIdHint={proposal.data.quote_id} selectedId={selectedId} onInserted={setSelectedId} />
          </div>
        )}
        <div
          ref={canvasScrollerRef}
          className={`min-h-0 flex-1 overflow-auto bg-zinc-100 print:overflow-visible print:bg-white ${isReadOnly ? "relative select-none" : ""}`}
          onClickCapture={
            isReadOnly
              ? (e) => {
                  // Allow scrolling & text selection; intercept edit-intent clicks
                  // on inputs / editable areas / buttons that aren't in the top bar.
                  const target = e.target as HTMLElement;
                  const editable = target.closest(
                    'input,textarea,select,[contenteditable="true"],button',
                  );
                  if (editable) {
                    e.preventDefault();
                    e.stopPropagation();
                    guardEdit();
                  }
                }
              : undefined
          }
        >
          <div className={isReadOnly ? "pointer-events-auto" : ""}>
            <ComposerCanvas
              proposalId={proposalId}
              blocks={items}
              selectedId={selectedId}
              quoteIdHint={proposal.data.quote_id}
              styleSettings={proposal.data.style_settings}
              language={proposal.data.language}
              previewMode={previewMode}
              onSelect={setSelectedId}
              onReorder={(next) => reorder.mutate(next)}
            />
          </div>
        </div>
        {!isReadOnly && !previewMode && (
          <div className="print:hidden">
            <BlockSettingsPanel
              proposalId={proposalId}
              proposal={proposal.data}
              quoteIdHint={proposal.data.quote_id}
              block={selected}
            />
          </div>
        )}
      </div>
    </div>
  );
}


