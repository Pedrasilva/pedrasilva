/**
 * Composer top bar — proposal title, status, Preview / Export PDF, and
 * a disabled "Converter para Contrato" stub that previews which blocks
 * would migrate to the future Contract Composer.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileDown,
  Printer,
  FileSignature,
  Settings,
  FileText,
  ChevronDown,
  Send,
  Trophy,
  XCircle,
  Lock,
  MoreHorizontal,
  LayoutTemplate,
  History,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import type {
  PsaProposal,
  PsaProposalBlock,
  PsaProposalStatus,
} from "@/lib/psa-proposal/types";
import { ConvertToContractDialog } from "./convert-to-contract-dialog";
import { ProposalHistoryDialog } from "./proposal-history-dialog";
import { ProposalStylePanel } from "./proposal-style-panel";
import { SendProposalDialog } from "./send-proposal-dialog";
import { ProposalSignatureStatus } from "./signature-status";
import { useHistoricalRevision } from "@/lib/psa-proposal/revision-context";
import { VersionsPanel } from "./versions-panel";
import { ImportTemplateDialog } from "./import-template-dialog";
import {
  useNextRevNumber,
  useProposalRevisions,
  useSetProposalOutcome,
} from "@/lib/psa-proposal/use-proposal-revisions";
import { useProposalSignatures } from "@/lib/psa-proposal/use-proposal-signatures";
import { useAutoSnapshotTrigger } from "@/lib/psa-proposal/use-proposal-history";
import { useEffect } from "react";


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
}: {
  proposal: PsaProposal;
  blocks: PsaProposalBlock[];
  previewMode?: boolean;
  onTogglePreview?: () => void;
}) {
  const { t } = useTranslation("common");
  const update = useUpdateProposal(proposal.id);
  const [convertOpen, setConvertOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signExistingOpen, setSignExistingOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const autoSnap = useAutoSnapshotTrigger(proposal.id);
  const { nextRev } = useNextRevNumber(proposal.id);
  const historical = useHistoricalRevision();
  const revMeta = historical
    ? { number: historical.revision.revNumber, sentAt: historical.revision.sentAt }
    : null;
  const setOutcome = useSetProposalOutcome(proposal.id);
  const isFinalLocked = !!proposal.locked_at;
  const isSentLocked = !isFinalLocked && proposal.status === "sent";
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
        onSuccess: () =>
          toast.success("Nova revisão editável iniciada."),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Erro"),
      },
    );

  // Throttled auto-snapshot whenever the proposal or its blocks change.
  useEffect(() => {
    if (isReadOnly) return;
    autoSnap();
  }, [proposal.updated_at, blocks.length, autoSnap, isReadOnly]);

  return (
    <div className="flex items-center gap-2 border-b bg-background px-3 py-2 print:hidden">
      <Input
        value={proposal.title}
        onChange={(e) => update.mutate({ title: e.target.value })}
        className="h-8 max-w-md font-medium"
        disabled={isReadOnly}
      />
      <Select
        value={proposal.status}
        onValueChange={(v) => update.mutate({ status: v as PsaProposalStatus })}
        disabled={isReadOnly}
      >
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Status strip — state, not actions */}
      <div className="ml-1 flex items-center gap-1.5 rounded-md border border-dashed bg-muted/40 px-2 py-1">
        {isFinalLocked && (
          <Badge
            variant="outline"
            className={
              proposal.outcome === "won"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : proposal.outcome === "lost"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-zinc-300 bg-zinc-50 text-zinc-700"
            }
          >
            <Lock className="mr-1 h-3 w-3" />
            {proposal.outcome === "won"
              ? "Ganha"
              : proposal.outcome === "lost"
                ? "Perdida"
                : "Bloqueada"}
          </Badge>
        )}
        {isSentLocked && (
          <Badge
            variant="outline"
            className="border-sky-300 bg-sky-50 text-sky-800"
          >
            <Lock className="mr-1 h-3 w-3" /> Enviada
          </Badge>
        )}
        <VersionsPanel proposal={proposal} />
        <ProposalSignatureStatus proposalId={proposal.id} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant={previewMode ? "default" : "outline"}
          size="sm"
          onClick={() => onTogglePreview?.()}
          title="Pré-visualizar a proposta como será impressa"
        >
          <Printer className="mr-1 h-3.5 w-3.5" />
          {previewMode ? "Sair pré-visualização" : "Pré-visualizar"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FileDown className="mr-1 h-3.5 w-3.5" /> Descarregar
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
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
            <DropdownMenuItem onClick={() => downloadAsWord(buildProposalFilename(proposal, revMeta))}>
              <FileText className="mr-2 h-3.5 w-3.5" /> Word (.doc)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {isSentLocked && latestSnapshot && !hasSignatureForLatest && (
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
            onClick={() => setSignExistingOpen(true)}
            title="Enviar a revisão já enviada para assinatura DocuSign, sem criar nova revisão"
          >
            <FileSignature className="mr-1 h-3.5 w-3.5" /> Enviar para assinatura
          </Button>
        )}
        {isSentLocked && (
          <Button
            size="sm"
            variant="outline"
            className="border-sky-400 text-sky-900 hover:bg-sky-50"
            onClick={startNewRevision}
            title="Criar nova revisão editável (a versão enviada mantém-se intacta)"
          >
            <Send className="mr-1 h-3.5 w-3.5 rotate-180" /> Nova revisão
          </Button>
        )}
        {!isFinalLocked && !isSentLocked && (
          <>
            <Button size="sm" onClick={() => setSendOpen(true)}>
              <Send className="mr-1 h-3.5 w-3.5" /> Enviar Proposta
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
              onClick={() => setSignOpen(true)}
              title="Enviar a revisão para assinatura DocuSign (cliente assina primeiro)"
            >
              <FileSignature className="mr-1 h-3.5 w-3.5" /> Enviar para assinatura
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" title="Mais ações">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isReadOnly && (
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                <LayoutTemplate className="mr-2 h-3.5 w-3.5" /> Importar template
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              <Settings className="mr-2 h-3.5 w-3.5" /> Definições
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setConvertOpen(true)}>
              <FileSignature className="mr-2 h-3.5 w-3.5" /> Converter para Contrato
            </DropdownMenuItem>
            {!historical && (
              <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                <History className="mr-2 h-3.5 w-3.5" /> Autosaves
              </DropdownMenuItem>
            )}
            {!isFinalLocked && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setWonOpen(true)}>
                  <Trophy className="mr-2 h-3.5 w-3.5" /> Marcar como Ganha
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLostOpen(true)}>
                  <XCircle className="mr-2 h-3.5 w-3.5" /> Marcar como Perdida
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!isReadOnly && (
        <ImportTemplateDialog
          proposalId={proposal.id}
          open={importOpen}
          onOpenChange={setImportOpen}
          hideTrigger
        />
      )}
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
            <SheetTitle>Definições da Proposta</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ProposalStylePanel proposal={proposal} />
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog open={wonOpen} onOpenChange={setWonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar proposta como Ganha?</AlertDialogTitle>
            <AlertDialogDescription>
              A proposta fica bloqueada — não será possível editar
              conteúdo, mas as revisões enviadas continuam acessíveis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                setOutcome.mutate("won", {
                  onSuccess: () => toast.success("Proposta marcada como Ganha."),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : "Erro"),
                })
              }
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={lostOpen} onOpenChange={setLostOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar proposta como Perdida?</AlertDialogTitle>
            <AlertDialogDescription>
              A proposta fica bloqueada — não será possível editar
              conteúdo, mas as revisões enviadas continuam acessíveis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                setOutcome.mutate("lost", {
                  onSuccess: () => toast.success("Proposta marcada como Perdida."),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : "Erro"),
                })
              }
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConvertToContractDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        blocks={blocks}
      />
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
  const revRaw =
    revision?.number != null ? revision.number : snap.rev ?? snap.revision;
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
    const source = document.querySelector<HTMLElement>(
      ".proposal-print-area .proposal-print-document",
    );
    if (!source) throw new Error("Proposal document was not found");

    const clone = source.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(
        '[data-editor-toolbar="true"], .ProseMirror-menubar, button, .print\\:hidden',
      )
      .forEach((node) => node.remove());
    clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((node) => {
      node.removeAttribute("contenteditable");
    });

    const styles = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]'),
    )
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
      `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtml(baseUrl)}"><title>${escapeHtml(filename)}</title>${styles}<style>
        @media print {
          @page { size: A4; margin: 0; }
          html, body { width: 210mm; margin: 0 !important; padding: 0 !important; background: white !important; }
          body.proposal-pdf-export,
          body.proposal-pdf-export * { visibility: visible !important; }
          body.proposal-pdf-export > .proposal-print-area {
            position: static !important;
            inset: auto !important;
            width: 210mm !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      </style></head><body class="proposal-pdf-export"><div class="proposal-print-area">${clone.outerHTML}</div></body></html>`,
    );
    printWindow.document.close();

    await new Promise<void>((resolve) => {
      if (printWindow.document.readyState === "complete") resolve();
      else printWindow.addEventListener("load", () => resolve(), { once: true });
    });
    await Promise.all(
      Array.from(printWindow.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(
        (link) =>
          new Promise<void>((resolve) => {
            if (link.sheet) {
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
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

function downloadAsWord(title: string) {
  const container = document.querySelector(".proposal-print-document");
  if (!container) {
    toast.error("Não foi possível encontrar a proposta para exportar.");
    return;
  }
  const styles = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  )
    .map((n) => n.outerHTML)
    .join("\n");
  const clone = container.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      '[data-editor-toolbar="true"], .ProseMirror-menubar, button, [contenteditable="true"] .ProseMirror-menu, .print\\:hidden',
    )
    .forEach((n) => n.remove());
  clone.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
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
  toast.success("Documento Word transferido.");
}

