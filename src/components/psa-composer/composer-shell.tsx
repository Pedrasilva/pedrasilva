import { useQuoteLifecycle } from "@/lib/quotes/use-quote-lifecycle";
import uiI18n from "@/i18n/index";
/**
 * 3-pane shell: library (L) · canvas (C) · settings (R) + top bar.
 * Owns the selected-block state.
 *
 * When wrapped in a `RevisionProvider`, the shell switches to a read-only
 * historical view of a sent revision: all data comes from the frozen
 * snapshot and no mutation is ever issued.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from '@/lib/toast';
import { ArrowLeft, FilePlus2, History, PanelLeft, PanelRight, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { parseSplitDrawers, splitDrawerStorageKey, type SplitDrawers } from "./split-drawers";
import { ComposerTopBar } from "./composer-top-bar";
import { ComposerCanvas } from "./canvas";
import { BlockLibraryPanel } from "./block-library-panel";
import { BlockSettingsPanel } from "./block-settings-panel";
import { PaginatedPreview } from "./paginated-preview";
import { useSmartPagination } from "./use-smart-pagination";
import { useLiveQuoteSnapshot, resolveProposalLang } from '@/lib/psa-proposal/live-data';
import { proposalPaginationReady } from '@/lib/psa-proposal/pagination-ready';
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
  const { user } = useAuth();
  const [drawerPreference, setDrawerPreference] = useState<{ userId: string | null; drawers: SplitDrawers }>({ userId: null, drawers: { library: false, settings: false } });
  const drawers = drawerPreference.userId === user?.id ? drawerPreference.drawers : { library: false, settings: false };
  useEffect(() => {
    if (!user?.id) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(splitDrawerStorageKey(user.id)); } catch { /* Storage can be disabled. */ }
    setDrawerPreference({ userId: user.id, drawers: parseSplitDrawers(saved) });
  }, [user?.id]);
  const setDrawer = (panel: keyof SplitDrawers, open: boolean) => {
    const next = { ...drawers, [panel]: open };
    setDrawerPreference({ userId: user?.id ?? null, drawers: next });
    if (user?.id) {
      try { localStorage.setItem(splitDrawerStorageKey(user.id), JSON.stringify(next)); } catch { /* Keep working without persistence. */ }
    }
  };

  const proposal = useProposal(proposalId);
  const blocks = useProposalBlocks(proposalId);
  const lifecycleQ = useQuoteLifecycle(proposal.data?.quote_id ?? undefined);
  const reorder = useReorderBlocks(proposalId);
  const update = useUpdateProposal(proposalId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"edit" | "split" | "pages">("edit");
  const previewMode = layout === "pages";
  const setPreviewMode = (value: boolean | ((current: boolean) => boolean)) => setLayout((current) => (typeof value === "function" ? value(current === "pages") : value) ? "pages" : "edit");
  const [zoom, setZoom] = useState("fit");
  const [scale, setScale] = useState(1);
  const [editorScale, setEditorScale] = useState(1);
  const sourceHostRef = useRef<HTMLDivElement | null>(null);
  const pagePaneRef = useRef<HTMLDivElement | null>(null);
  const [source, setSource] = useState<HTMLDivElement | null>(null);
  const [revision, setRevision] = useState(0);
  const observedEditRef = useRef("");
  const liveQuery = useLiveQuoteSnapshot(proposal.data?.quote_id, resolveProposalLang(proposal.data?.language));
  const dataReady = proposalPaginationReady(proposal, blocks, liveQuery, !!proposal.data?.quote_id);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  useSmartPagination(sourceRef, revision);
  const selectBlock = useCallback((id: string) => {
    setSelectedId(id);
    const node = Array.from(sourceHostRef.current?.querySelectorAll<HTMLElement>("[data-proposal-block-id]") ?? []).find((n) => n.dataset.proposalBlockId === id);
    if (node && sourceHostRef.current?.classList.contains("proposal-editor-visible")) node.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  useEffect(() => {
    const host = sourceHostRef.current;
    if (!host) return;
    const documentNode = host.querySelector<HTMLDivElement>(".proposal-print-document");
    setSource(documentNode); sourceRef.current = documentNode;
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.type !== "attributes" || (m.attributeName !== "style" && m.attributeName !== "class"))) {
        const signature = host.innerHTML.replace(/style="[^"]*"/g, "").replace(/class="[^"]*"/g, "");
        if (signature !== observedEditRef.current) { observedEditRef.current = signature; setRevision((n) => n + 1); }
      }
    });
    observer.observe(host, { subtree: true, childList: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, [proposal.data?.id]);

  useEffect(() => {
    const pane = pagePaneRef.current; if (!pane) return;
    const updateScale = () => setScale(zoom === "fit" ? Math.min(1, Math.max(0.1, (pane.clientWidth - 48) / (210 * 96 / 25.4))) : Number(zoom));
    const observer = new ResizeObserver(updateScale); observer.observe(pane); updateScale();
    return () => observer.disconnect();
  }, [zoom, layout, proposal.data?.id]);
  const canvasScrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const pane = canvasScrollerRef.current;
    if (!pane) return;
    const fitEditor = () => setEditorScale(layout === "split" ? Math.min(1, Math.max(0.1, (pane.clientWidth - 32) / (210 * 96 / 25.4))) : 1);
    const observer = new ResizeObserver(fitEditor);
    observer.observe(pane); fitEditor();
    return () => observer.disconnect();
  }, [layout, proposal.data?.id]);
  useEffect(() => {
    if (layout !== "split") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDrawer("library", false); setDrawer("settings", false); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [layout, drawerPreference]);

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

  const isFinalLocked = !!proposal.data.locked_at || ["approved","signed","converted"].includes(lifecycleQ.data?.state ?? ""); // won / lost
  const isSentLocked = !isFinalLocked && (proposal.data.status === "sent" || lifecycleQ.data?.state === "sent");
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
          toast.error(e instanceof Error ? e.message : uiI18n.t("common:error")),
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
      <div className="proposal-preview-toolbar flex shrink-0 flex-wrap items-center gap-3 border-b bg-background px-4 py-2 print:hidden">
        <div role="group" aria-label={t("proposalComposer.pagination.layout")} className="flex gap-1">
          {(["edit", "split", "pages"] as const).map((mode) => <Button key={mode} size="sm" variant={layout === mode ? "secondary" : "ghost"} onClick={() => setLayout(mode)}>{mode === "edit" ? t("edit") : t(`proposalComposer.pagination.${mode}`)}</Button>)}
        </div>
        <select aria-label={t("proposalComposer.pagination.zoom")} value={zoom} onChange={(e) => setZoom(e.target.value)} className="rounded border border-border bg-background p-1 text-sm">
          <option value="fit">{t("proposalComposer.pagination.fitWidth")}</option><option value="0.75">75%</option><option value="1">100%</option>
        </select>
        {layout === "split" && !isReadOnly && <div className="ml-auto flex gap-1">
          {(["library", "settings"] as const).map((panel) => <Tooltip key={panel}>
            <TooltipTrigger asChild><Button size="icon" variant={drawers[panel] ? "secondary" : "ghost"} aria-label={t(panel)} aria-expanded={drawers[panel]} aria-controls={`proposal-split-${panel}`} onClick={() => setDrawer(panel, !drawers[panel])}>
              {panel === "library" ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
            </Button></TooltipTrigger><TooltipContent>{t(panel)}</TooltipContent>
          </Tooltip>)}
        </div>}
      </div>
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

        </div>
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden print:block" data-composer-layout={layout}>
        {!isReadOnly && (
          <div id="proposal-split-library" hidden={layout === "split" && !drawers.library} className={layout === "split" ? "absolute inset-y-0 left-0 z-30 flex max-w-full flex-col border-r border-border bg-background shadow-lg print:hidden" : "shrink-0 print:hidden"}>
            {layout === "split" && <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1"><span className="text-sm font-medium">{t("library")}</span><Button size="icon" variant="ghost" aria-label={t("close")} onClick={() => setDrawer("library", false)}><X className="h-4 w-4" /></Button></div>}
            <div className="min-h-0 flex-1 overflow-auto">
            <BlockLibraryPanel proposalId={proposalId} blocks={items} quoteIdHint={proposal.data.quote_id} selectedId={selectedId} onInserted={setSelectedId} />
            </div>
          </div>
        )}
        <div
          ref={canvasScrollerRef}
          className={`min-h-0 min-w-0 flex-1 overflow-auto bg-muted ${layout === "pages" ? "proposal-editor-hidden" : "proposal-editor-visible"} ${isReadOnly ? "relative select-none" : ""}`}
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
          <div ref={sourceHostRef} className="proposal-source-host" style={{ zoom: editorScale }}>
            <ComposerCanvas
              proposalId={proposalId}
              blocks={items}
              selectedId={selectedId}
              quoteIdHint={proposal.data.quote_id}
              styleSettings={proposal.data.style_settings}
              language={proposal.data.language}
              previewMode={false}
              readOnly={isReadOnly}
              onSelect={selectBlock}
              onReorder={(next) => reorder.mutate(next)}
            />
          </div>
        </div>
        <div ref={pagePaneRef} className={`min-h-0 min-w-0 flex-1 overflow-auto bg-muted ${layout === "edit" ? "proposal-pages-hidden" : ""}`}>
          <div className="proposal-zoom-frame" style={{ zoom: 1, width: `${210 * 96 / 25.4 * scale}px`, margin: "0 auto" }}>
            <div className="proposal-zoom-sheet" style={{ width: "210mm", transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <PaginatedPreview source={source} dataReady={dataReady} invalidateKey={`${revision}:${JSON.stringify(proposal.data.style_settings)}`} selectedId={selectedId} onSelect={selectBlock} />
            </div>
          </div>
        </div>
        {!isReadOnly && (
          <div id="proposal-split-settings" hidden={layout === "split" && !drawers.settings} className={layout === "split" ? "absolute inset-y-0 right-0 z-30 flex max-w-full flex-col border-l border-border bg-background shadow-lg print:hidden" : "shrink-0 print:hidden"}>
            {layout === "split" && <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1"><span className="text-sm font-medium">{t("settings")}</span><Button size="icon" variant="ghost" aria-label={t("close")} onClick={() => setDrawer("settings", false)}><X className="h-4 w-4" /></Button></div>}
            <div className="min-h-0 flex-1 overflow-auto">
            <BlockSettingsPanel
              proposalId={proposalId}
              proposal={proposal.data}
              quoteIdHint={proposal.data.quote_id}
              block={selected}
            />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


