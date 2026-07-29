/**
 * Send Proposal dialog. Flow:
 *  1. Show the auto-generated filename ("{title} {YYMMDD} proposal rev NN").
 *  2. User clicks "Abrir diálogo de impressão" — we set document.title to the
 *     filename and call window.print(). The browser's Save-as-PDF preselects
 *     it as the download filename.
 *  3. User drops or picks the resulting PDF, we upload it and record the
 *     revision. The working copy stays editable as Rev NN+1.
 */
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { FileDown, Printer, Send, Upload, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSendProposal } from "@/lib/psa-proposal/use-proposal-revisions";
import { printProposalDocument } from "./composer-top-bar";
import type { PsaProposal } from "@/lib/psa-proposal/types";

function buildProposalBaseFilename(proposal: PsaProposal, revNumber: number): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rev = String(Math.max(0, Math.trunc(revNumber))).padStart(2, "0");
  const name = (proposal.title || "proposta").trim();
  return `${name} ${yy}${mm}${dd} proposal rev ${rev}`;
}

export function SendProposalDialog({
  open,
  onOpenChange,
  proposal,
  nextRev,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  proposal: PsaProposal;
  nextRev: number;
}) {
  const filename = buildProposalBaseFilename(proposal, nextRev);
  const [file, setFile] = useState<File | null>(null);
  const [printed, setPrinted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const send = useSendProposal(proposal.id);

  const openPrint = useCallback(() => {
    const original = document.title;
    document.title = filename;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    setPrinted(true);
    window.print();
    setTimeout(restore, 2000);
  }, [filename]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      toast.error("Ficheiro tem de ser PDF.");
      return;
    }
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      toast.error("Ficheiro tem de ser PDF.");
      return;
    }
    setFile(f);
  };

  const handleSend = () => {
    if (!file) {
      toast.error("Adiciona o PDF gerado antes de enviar.");
      return;
    }
    send.mutate(
      { pdfBlob: file, filename, revNumber: nextRev },
      {
        onSuccess: () => {
          toast.success(`Revisão ${String(nextRev).padStart(2, "0")} guardada.`);
          setFile(null);
          setPrinted(false);
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erro a enviar proposta";
          toast.error(msg);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Enviar Proposta — Rev {String(nextRev).padStart(2, "0")}
          </DialogTitle>
          <DialogDescription>
            Esta ação bloqueia a revisão atual como imutável e guarda o PDF no
            construtor. Continuas a editar numa cópia (Rev {String(nextRev + 1).padStart(2, "0")}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Nome do ficheiro
            </div>
            <div className="font-mono text-[13px]">{filename}.pdf</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">1. Gerar o PDF</div>
            <p className="text-xs text-muted-foreground">
              Abre o diálogo de impressão e escolhe <strong>Guardar como PDF</strong>.
              O nome do ficheiro já vem preenchido.
            </p>
            <Button variant="outline" size="sm" onClick={openPrint} className="w-full">
              <Printer className="mr-2 h-4 w-4" />
              Abrir diálogo de impressão
              {printed && <CheckCircle2 className="ml-2 h-3.5 w-3.5 text-emerald-600" />}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">2. Anexar o PDF gerado</div>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground hover:border-muted-foreground/60"
            >
              <Upload className="mb-1 h-5 w-5" />
              {file ? (
                <span className="font-medium text-foreground">{file.name}</span>
              ) : (
                <>
                  <span>Arrasta o PDF ou clica para escolher</span>
                  <span className="text-xs">Só ficheiros .pdf</span>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={!file || send.isPending}>
            <FileDown className="mr-2 h-4 w-4" />
            {send.isPending ? "A guardar…" : `Enviar Rev ${String(nextRev).padStart(2, "0")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
