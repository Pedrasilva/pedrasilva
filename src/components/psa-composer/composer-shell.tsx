import { translateError } from '@/lib/translate-error';
import uiI18n from "@/i18n/index";
/**
 * 3-pane shell: library (L) · canvas (C) · settings (R) + top bar.
 * Owns the selected-block state.
 *
 * When wrapped in a `RevisionProvider`, the shell switches to a read-only
 * historical view of a sent revision: all data comes from the frozen
 * snapshot and no mutation is ever issued.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from '@/lib/toast';
import { ArrowLeft, FilePlus2, History } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ComposerTopBar } from "./composer-top-bar";
import { ComposerCanvas } from "./canvas";
import { BlockLibraryPanel } from "./block-library-panel";
import { BlockSettingsPanel } from "./block-settings-panel";
import { useHistoricalRevision } from "@/lib/psa-proposal/revision-context";
import {
  useProposal,
  useProposalBlocks,
  useReorderBlocks,
  useUpdateProposal,
} from "@/lib/psa-proposal/use-psa-proposal";


export function ComposerShell({ proposalId }: { proposalId: string }) {
  const { t } = useTranslation("common");
  const historical = useHistoricalRevision();

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
         {uiI18n.t("crm:quoteEditor.loadingProposal")} </div>
    );
  }

  const isFinalLocked = !!proposal.data.locked_at; // won / lost
  const isSentLocked = !isFinalLocked && proposal.data.status === "sent";
  const isReadOnly = isFinalLocked || isSentLocked || !!historical;


  const startNewRevision = () => {
    update.mutate(
      { status: "draft" },
      {
        onSuccess: () =>
          toast.success(
            uiI18n.t("crm:quoteEditor.newEditableRevisionHint"),
          ),
        onError: (e) =>
          toast.error(e instanceof Error ? translateError(e.message) : uiI18n.t("common:error")),
      },
    );
  };

  const guardEdit = () => {
    if (isFinalLocked) {
      toast.error(uiI18n.t("crm:quoteEditor.cannotEditLocked"));
      return;
    }
    if (isSentLocked) {
      toast.message(uiI18n.t("crm:quoteEditor.sentVersionLocked"), {
        description:
          uiI18n.t("crm:quoteEditor.newRevisionHelp"),
        action: {
          label: uiI18n.t("crm:quoteEditor.newRevision"),
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
        <div className="proposal-preview-toolbar flex shrink-0 items-center border-b bg-background px-4 py-2">
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
      {historical && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 print:hidden">
          <span className="flex items-center gap-2">
            <History className="h-3.5 w-3.5" />
             {uiI18n.t("crm:quoteEditor.viewRevisionPrefix")} {String(historical.revision.revNumber).padStart(2, "0")}  {uiI18n.t("crm:quoteEditor.sentOnPrefix")} {" "}
            {new Date(historical.revision.sentAt).toLocaleDateString(uiI18n.language, {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
             {uiI18n.t("crm:quoteEditor.historicalReadonlyHint")} {!historical.quoteData && (
              <strong className="ml-1">
                 {uiI18n.t("crm:quoteEditor.oldRevisionHint")} </strong>
            )}
          </span>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
          >
            <Link
              to="/proposals/$proposalId/composer"
              params={{ proposalId }}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.currentVersion")} </Link>
          </Button>
        </div>
      )}
      {isFinalLocked && !historical && (

        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 print:hidden">
           {uiI18n.t("crm:quoteEditor.proposalLocked")} {proposal.data.outcome === "won"
            ? uiI18n.t("crm:quoteEditor.wonParenthesis")
            : proposal.data.outcome === "lost"
              ? uiI18n.t("crm:quoteEditor.lostParenthesis")
              : ""}
           {uiI18n.t("crm:quoteEditor.lockedContentHint")} </div>
      )}
      {isSentLocked && !historical && (
        <div className="flex items-center justify-between gap-3 border-b border-sky-300 bg-sky-50 px-4 py-2 text-xs text-sky-900 print:hidden">
          <span>
             {uiI18n.t("crm:quoteEditor.sentRevisionHint")} </span>
          <Button
            size="sm"
            variant="outline"
            className="border-sky-400 bg-white text-sky-900 hover:bg-sky-100"
            onClick={startNewRevision}
          >
            <FilePlus2 className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.newRevision")} </Button>
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


