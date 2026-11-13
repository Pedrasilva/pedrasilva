import { useQuoteLifecycle } from "@/lib/quotes/use-quote-lifecycle";
import uiI18n from "@/i18n/index";
/**
 * Composer top bar — proposal title, status, Preview / Export PDF, and
 * immutable sent revisions and signature records.
 */
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuoteSnapshot, resolveProposalLang } from "@/lib/psa-proposal/live-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  FileDown,
  Printer,
  FileSignature,
  Settings,
  FileText,
  ChevronDown,
  Send,
  Lock,
  MoreHorizontal,
  History,
} from "lucide-react";
import { toast } from '@/lib/toast';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
import { useUpdateProposal } from "@/lib/psa-proposal/use-psa-proposal";
import type { PsaProposal, PsaProposalBlock, PsaProposalStatus } from "@/lib/psa-proposal/types";
import { ProposalHistoryDialog } from "./proposal-history-dialog";
import { ProposalStylePanel } from "./proposal-style-panel";
import { SendProposalDialog } from "./send-proposal-dialog";
import { ProposalSignatureStatus } from "./signature-status";
import { useHistoricalRevision } from "@/lib/psa-proposal/revision-context";
import { VersionsPanel } from "./versions-panel";
import { useNextRevNumber, useProposalRevisions } from "@/lib/psa-proposal/use-proposal-revisions";
import { useProposalSignatures } from "@/lib/psa-proposal/use-proposal-signatures";
import { useAutoSnapshotTrigger } from "@/lib/psa-proposal/use-proposal-history";
import { useEffect } from "react";
import { completedPagedDocument } from "@/lib/psa-proposal/paged-frame";
import { ProposalMasterButton } from './master-page-editor';

const STATUSES: PsaProposalStatus[] = [
  "draft",
  "review",
  "sent",
  "accepted",
  "declined",
  "archived",
];

export function ComposerTopBar({
  proposal,
  blocks,
  previewMode = false,
  onTogglePreview,
  embedded = false,
  viewControls,
}: {
  proposal: PsaProposal;
  blocks: PsaProposalBlock[];
  previewMode?: boolean;
  onTogglePreview?: () => void;
  embedded?: boolean;
  viewControls?: ReactNode;
}) {
  const { t } = useTranslation("common");
  const update = useUpdateProposal(proposal.id);
  const qc = useQueryClient();
  const live = useLiveQuoteSnapshot(proposal.quote_id, resolveProposalLang(proposal.language), proposal.id);
  const [refreshedSource, setRefreshedSource] = useState<string | null>(null);
  const sourceSignature = live.data ? JSON.stringify(live.data) : null;
  useEffect(() => { if (sourceSignature && refreshedSource === null) setRefreshedSource(sourceSignature); }, [sourceSignature, refreshedSource]);
  const estimateChanged = refreshedSource !== null && sourceSignature !== null && refreshedSource !== sourceSignature;
  const refreshEstimate = async () => {
    try {
      const result = await live.refetch();
      if (result.error) throw result.error;
      if (result.data) setRefreshedSource(JSON.stringify(result.data));
      await qc.invalidateQueries({ queryKey: ["psa-proposal-blocks", proposal.id] });
    } catch (error) { toast.error(error instanceof Error ? error.message : uiI18n.t("common:error")); }
  };
  const lifecycleQ = useQuoteLifecycle(proposal.quote_id ?? undefined);
  const lifecycle = lifecycleQ.data;
  const [sendOpen, setSendOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signExistingOpen, setSignExistingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const autoSnap = useAutoSnapshotTrigger(proposal.id);
  const { nextRev } = useNextRevNumber(proposal.id);
  const historical = useHistoricalRevision();
  const revMeta = historical
    ? { number: historical.revision.revNumber, sentAt: historical.revision.sentAt }
    : null;
  const isFinalLocked = !!proposal.locked_at || lifecycle?.state === "converted" || lifecycle?.state === "approved" || lifecycle?.state === "signed";
  const isSentLocked = !isFinalLocked && (proposal.status === "sent" || lifecycle?.state === "sent");
  const isReadOnly = isFinalLocked || isSentLocked || !!historical;
  const { data: revisions } = useProposalRevisions(proposal.id);
  const { data: signatures } = useProposalSignatures(proposal.id);
  // Newest sent revision with a stored PDF — the document DocuSign would sign.
  const latestSnapshot = (revisions ?? []).find((r) => !!r.pdf_storage_path);
  const hasSignatureForLatest = (signatures ?? []).some(
    (s) => s.snapshot_id === latestSnapshot?.id,
  );

  const startNewRevision = () =>
    update.mutate(
      { status: "draft" },
      {
        onSuccess: () => toast.success(uiI18n.t("crm:quoteEditor.editableRevisionStarted")),
        onError: (e) => toast.error(e instanceof Error ? e.message : uiI18n.t("common:error")),
      },
    );

  // Throttled auto-snapshot whenever the proposal or its blocks change.
  useEffect(() => {
    if (isReadOnly) return;
    autoSnap();
  }, [proposal.updated_at, blocks.length, autoSnap, isReadOnly]);

  return (
    <div className="proposal-document-toolbar sticky top-28 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 print:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <VersionsPanel proposal={proposal} />
        {proposal.quote_id && <Tooltip><TooltipTrigger asChild>
          <Button variant="outline" size="sm" disabled={!!historical || live.isFetching} onClick={() => void refreshEstimate()} className="gap-1.5 whitespace-nowrap">
            <RefreshCw className={live.isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            <span className="proposal-refresh-label">{uiI18n.t("crm:builderHeader.refresh")}</span>
            {estimateChanged && <span className="h-2 w-2 rounded-full bg-warning" />}
          </Button>
        </TooltipTrigger><TooltipContent>{uiI18n.t(estimateChanged ? "crm:builderHeader.estimateUpdated" : "crm:builderHeader.refresh")}</TooltipContent></Tooltip>}
        {!embedded && <Input value={proposal.title} onChange={(e) => update.mutate({ title: e.target.value })} className="h-8 max-w-48" disabled={isReadOnly} />}
      </div>
      {viewControls}
      <div className="flex flex-1 justify-end items-center gap-2">
        <ProposalMasterButton proposal={proposal} readOnly={isReadOnly} compactClassName="proposal-toolbar-secondary" />
        <div className="proposal-toolbar-secondary">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FileDown className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("common:download")} <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                const printWindow = window.open("", "_blank");
                if (!printWindow) {
                  toast.error(t("proposalComposer.pagination.pdfError"));
                  return;
                }
                void printProposalDocument(
                  proposal,
                  printWindow,
                  {
                    loading: t("proposalComposer.pagination.pdfLoading"),
                    error: t("proposalComposer.pagination.pdfError"),
                  },
                  buildProposalFilename(proposal, revMeta),
                );
              }}
            >
              <FileDown className="mr-2 h-3.5 w-3.5" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => downloadAsWord(buildProposalFilename(proposal, revMeta))}
            >
              <FileText className="mr-2 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.wordDoc")} </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
        {!embedded && !isFinalLocked && !isSentLocked && <Button size="sm" onClick={() => setSendOpen(true)}><Send className="mr-1 h-3.5 w-3.5" />{uiI18n.t("crm:quoteEditor.sendProposal")}</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" title={uiI18n.t("common:moreActions")}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="proposal-toolbar-overflow">
              <ProposalMasterButton proposal={proposal} readOnly={isReadOnly} />
              <DropdownMenuItem onSelect={() => {
                const printWindow = window.open("", "_blank");
                if (printWindow) void printProposalDocument(proposal, printWindow, { loading: t("proposalComposer.pagination.pdfLoading"), error: t("proposalComposer.pagination.pdfError") }, buildProposalFilename(proposal, revMeta));
              }}><FileDown className="mr-2 h-3.5 w-3.5" />{uiI18n.t("crm:builderHeader.downloadPdf")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => downloadAsWord(buildProposalFilename(proposal, revMeta))}><FileText className="mr-2 h-3.5 w-3.5" />{uiI18n.t("crm:quoteEditor.wordDoc")}</DropdownMenuItem>
              <DropdownMenuSeparator />
            </div>
            {isSentLocked && !proposal.quote_id && <DropdownMenuItem onSelect={startNewRevision}>{uiI18n.t("crm:quoteEditor.newRevision")}</DropdownMenuItem>}
            <div className="px-2 py-1"><ProposalSignatureStatus proposalId={proposal.id} /></div>
            {lifecycle?.state === "approved" && latestSnapshot && !hasSignatureForLatest && <DropdownMenuItem onSelect={()=>setSignExistingOpen(true)}>{uiI18n.t("crm:quoteEditor.sendSignature")}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              <Settings className="mr-2 h-3.5 w-3.5" />  {uiI18n.t("common:settings")} </DropdownMenuItem>
            {!historical && (
              <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                <History className="mr-2 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.autosaves")} </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!historical && (
        <ProposalHistoryDialog
          proposalId={proposal.id}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          hideTrigger
        />
      )}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-[380px] overflow-y-auto sm:max-w-[380px]">
          <SheetHeader>
            <SheetTitle> {uiI18n.t("crm:quoteEditor.proposalSettings")} </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ProposalStylePanel proposal={proposal} />
          </div>
        </SheetContent>
      </Sheet>
      <SendProposalDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        proposal={proposal}
        nextRev={nextRev}
        mode="signature"
      />
      <SendProposalDialog
        open={signExistingOpen}
        onOpenChange={setSignExistingOpen}
        proposal={proposal}
        nextRev={nextRev}
        mode="signature-existing"
        existingSnapshot={
          latestSnapshot
            ? {
                id: latestSnapshot.id,
                revNumber: latestSnapshot.rev_number,
                filename: latestSnapshot.pdf_filename,
              }
            : undefined
        }
      />
      <SendProposalDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        proposal={proposal}
        nextRev={nextRev}
      />
    </div>
  );
}

/**
 * Build the canonical proposal filename:
 *   "{project name} {YYMMDD} proposal rev {NN}"
 * e.g. "2626 Hotel Alqueva 260703 proposal rev 00".
 * Revision is read from proposal.project_snapshot.rev (numeric) and
 * defaults to 0.
 */
function buildProposalFilename(
  proposal: PsaProposal,
  revision?: { number: number | null; sentAt: string | null } | null,
): string {
  const now = revision?.sentAt ? new Date(revision.sentAt) : new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yy}${mm}${dd}`;
  const snap = (proposal.project_snapshot ?? {}) as Record<string, unknown>;
  const revRaw = revision?.number != null ? revision.number : (snap.rev ?? snap.revision);
  const revNum = Number.isFinite(Number(revRaw)) ? Number(revRaw) : 0;
  const rev = String(Math.max(0, Math.trunc(revNum))).padStart(2, "0");
  const name = (proposal.title || "proposta").trim();
  return `${name} ${dateStr} proposal rev ${rev}`;
}

export async function printProposalDocument(
  proposal: PsaProposal,
  printWindow: Window,
  messages: { loading: string; error: string } = {
    loading: "Preparing PDF pages…",
    error: "The PDF preview could not be prepared.",
  },
  filenameOverride?: string,
) {
  const loadingToast = toast.loading(messages.loading);
  try {
    // Always export completed Paged.js sheets, never the continuous editor tree.
    const host = document.querySelector<HTMLElement>(".proposal-paginated-preview");
    if (!host) throw new Error("Proposal paginated document was not found");
    await new Promise<void>((resolve, reject) => {
      let deadline: ReturnType<typeof setTimeout>;
      const observer = new MutationObserver(check);
      function check() {
        if (host?.dataset.paginationStatus === "error") { cleanup(); reject(new Error("Proposal pagination failed")); }
        else if (host && completedPagedDocument(host) && !document.querySelector('.proposal-source-host [data-live-ready="false"]')) { cleanup(); resolve(); }
      }
      function cleanup() { observer.disconnect(); clearTimeout(deadline); }
      observer.observe(host, { attributes: true, childList: true, subtree: true });
      deadline = setTimeout(() => { cleanup(); reject(new Error("Proposal pagination did not finish")); }, 120000);
      check();
    });
    const pagedDocument = completedPagedDocument(host);
    const source = pagedDocument?.querySelector<HTMLElement>(".pagedjs_pages");
    if (!source) throw new Error("Proposal pages were not found");
    const clone = source.cloneNode(true) as HTMLElement;
    // Every sheet is printed, including images outside the popup viewport.
    // Lazy images otherwise never start loading while decode() waits forever.
    clone.querySelectorAll<HTMLImageElement>('img').forEach((image) => { image.loading = 'eager'; });
    clone.querySelectorAll(".proposal-paged-block-selected").forEach((n) => n.classList.remove("proposal-paged-block-selected"));
    // Carry the exact committed page count into the isolated print document.
    const pageCount = source.querySelectorAll('.pagedjs_page').length;

    const styles = Array.from(pagedDocument?.querySelectorAll('style, link[rel="stylesheet"]') ?? [])
      .map((node) => {
        if (node instanceof HTMLLinkElement) {
          const absoluteHref = new URL(node.href, document.baseURI).href;
          return `<link rel="stylesheet" href="${escapeHtml(absoluteHref)}">`;
        }
        return node.outerHTML;
      })
      .join("\n");
    const filename = filenameOverride?.trim() || buildProposalFilename(proposal);
    const baseUrl = new URL(".", document.baseURI).href;
    printWindow.document.open();
    printWindow.document.write(
      `<!doctype html><html lang="${escapeHtml(pagedDocument?.documentElement.lang || "pt-PT")}"><head><meta charset="utf-8"><base href="${escapeHtml(baseUrl)}"><title>${escapeHtml(filename)}</title>${styles}<style>
        @media print {
          @page { size: A4; margin: 0; }
          @page proposal-export-landscape { size: A4 landscape; margin: 0; }
          .proposal-export-sheets .pagedjs_pages { display: block !important; }
          .proposal-export-sheets .pagedjs_page { page: auto !important; width: 210mm !important; height: 297mm !important; margin: 0 !important; break-after: page !important; break-inside: avoid !important; box-shadow: none !important; }
          .proposal-export-sheets .pagedjs_page:last-child { break-after: auto !important; }
          .proposal-export-sheets .pagedjs_pagebox { width: 210mm !important; height: 297mm !important; }
          .proposal-export-sheets .pagedjs_page[data-orientation="landscape"] { page: proposal-export-landscape !important; width: 297mm !important; height: 210mm !important; }
          .proposal-export-sheets .pagedjs_page[data-orientation="landscape"] .pagedjs_pagebox { width: 297mm !important; height: 210mm !important; }
          /* Chromium drops the absolutely positioned top margin furniture when
             fragmenting the completed sheets. Keep it in its grid flow, with
             the same page-edge origin used by the preview master geometry. */
          .proposal-export-sheets .proposal-master-document .pagedjs_margin-top-center { position: relative !important; left: calc(-1 * var(--pagedjs-margin-left)) !important; }
          .proposal-export-sheets .pagedjs_area { overflow: hidden !important; }
          .proposal-export-sheets .pagedjs_page_content, .proposal-export-sheets .pagedjs_page_content * { break-before: auto !important; break-after: auto !important; }
          .proposal-export-sheets .proposal-print-document { min-height: 0 !important; width: auto !important; padding: 0 !important; margin: 0 !important; }
          .proposal-export-sheets .proposal-page-header, .proposal-export-sheets .proposal-page-footer { position: static !important; }
          .proposal-export-sheets .proposal-page-break-before, .proposal-export-sheets .proposal-page-break-after { break-before: auto !important; break-after: auto !important; }

          html, body { width: auto !important; height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: white !important; }
          body.proposal-pdf-export,
          body.proposal-pdf-export * { visibility: visible !important; }
          body.proposal-pdf-export > .proposal-export-sheets {
            position: static !important;
            inset: auto !important;
            width: auto !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      </style></head><body class="proposal-pdf-export" data-export-page-count="${pageCount}"><div class="proposal-export-sheets proposal-paginated-preview">${clone.outerHTML}</div></body></html>`,
    );
    printWindow.document.close();

    await new Promise<void>((resolve) => {
      if (printWindow.document.readyState === "complete") resolve();
      else printWindow.addEventListener("load", () => resolve(), { once: true });
    });
    await Promise.all(
      Array.from(
        printWindow.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      ).map(
        (link) =>
          new Promise<void>((resolve) => {
            // load/error may already have fired before window.load resolved.
            // A null sheet after that point is a failed stylesheet, not pending.
            if (link.sheet || printWindow.document.readyState === "complete") {
              resolve();
              return;
            }
            link.addEventListener("load", () => resolve(), { once: true });
            link.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    );
    await printWindow.document.fonts?.ready;
    await Promise.all(
      Array.from(printWindow.document.images).map(async (image) => {
        if (image.complete) return;
        try {
          await image.decode();
        } catch {
          // A missing decorative image must not block the printable document.
        }
      }),
    );
    toast.dismiss(loadingToast);
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    console.error("Proposal PDF preparation failed", error);
    printWindow.close();
    toast.error(messages.error, { id: loadingToast });
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );
}

function downloadAsWord(title: string) {
  const container = document.querySelector(".proposal-print-document");
  if (!container) {
    toast.error(uiI18n.t("crm:quoteEditor.exportMissing"));
    return;
  }
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((n) => n.outerHTML)
    .join("\n");
  const clone = container.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      '[data-editor-toolbar="true"], .ProseMirror-menubar, button, [contenteditable="true"] .ProseMirror-menu, .print\\:hidden',
    )
    .forEach((n) => n.remove());
  clone.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
  const safeTitle = (title || "proposta").replace(/[^a-z0-9\-_\s]/gi, "").trim() || "proposta";
  const source = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${safeTitle}</title>${styles}<style>@page{size:A4;margin:20mm}body{font-family:'Inter',Arial,sans-serif}</style></head><body>${clone.outerHTML}</body></html>`;

  const blob = new Blob(["\ufeff", source], {
    type: "application/msword",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeTitle}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success(uiI18n.t("crm:quoteEditor.wordDownloaded"));
}
