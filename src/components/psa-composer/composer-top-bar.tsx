/**
 * Composer top bar — proposal title, status, Preview / Export PDF, and
 * a disabled "Converter para Contrato" stub that previews which blocks
 * would migrate to the future Contract Composer.
 */
import { useState } from "react";
import { FileDown, Printer, FileSignature, Settings, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUpdateProposal } from "@/lib/psa-proposal/use-psa-proposal";
import type {
  PsaProposal,
  PsaProposalBlock,
  PsaProposalStatus,
} from "@/lib/psa-proposal/types";
import { ConvertToContractDialog } from "./convert-to-contract-dialog";
import { ProposalHistoryDialog } from "./proposal-history-dialog";
import { ProposalStylePanel } from "./proposal-style-panel";
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
}: {
  proposal: PsaProposal;
  blocks: PsaProposalBlock[];
}) {
  const update = useUpdateProposal(proposal.id);
  const [convertOpen, setConvertOpen] = useState(false);
  const autoSnap = useAutoSnapshotTrigger(proposal.id);

  // Throttled auto-snapshot whenever the proposal or its blocks change.
  // The hook itself caps frequency to ~1 per 5 min via localStorage.
  useEffect(() => {
    autoSnap();
  }, [proposal.updated_at, blocks.length, autoSnap]);

  return (
    <div className="flex items-center gap-2 border-b bg-background px-3 py-2 print:hidden">
      <Input
        value={proposal.title}
        onChange={(e) => update.mutate({ title: e.target.value })}
        className="h-8 max-w-md font-medium"
      />
      <Select
        value={proposal.status}
        onValueChange={(v) => update.mutate({ status: v as PsaProposalStatus })}
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
      <div className="ml-auto flex items-center gap-2">
        <ProposalHistoryDialog proposalId={proposal.id} />
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              title="Definições da proposta (tipografia, margens, cabeçalho, rodapé)"
            >
              <Settings className="mr-1 h-3.5 w-3.5" /> Definições
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[380px] overflow-y-auto sm:max-w-[380px]">
            <SheetHeader>
              <SheetTitle>Definições da Proposta</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ProposalStylePanel proposal={proposal} />
            </div>
          </SheetContent>
        </Sheet>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConvertOpen(true)}
          title="Pré-visualizar migração para contrato"
        >
          <FileSignature className="mr-1 h-3.5 w-3.5" /> Converter para Contrato
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 h-3.5 w-3.5" /> Pré-visualizar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <FileDown className="mr-1 h-3.5 w-3.5" /> Descarregar
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                window.print();
                toast.message("Use 'Guardar como PDF' no diálogo de impressão.");
              }}
            >
              <FileDown className="mr-2 h-3.5 w-3.5" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadAsWord(proposal.title)}>
              <FileText className="mr-2 h-3.5 w-3.5" /> Word (.doc)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConvertToContractDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        blocks={blocks}
      />
    </div>
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
  // Clone and strip UI-only chrome (editor toolbars, buttons, print:hidden) so
  // the exported Word doc contains only the rendered proposal.
  const clone = container.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      '[data-editor-toolbar="true"], .ProseMirror-menubar, button, [contenteditable="true"] .ProseMirror-menu, .print\\:hidden',
    )
    .forEach((n) => n.remove());
  // Flatten contenteditable so Word doesn't render an editable region.
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
