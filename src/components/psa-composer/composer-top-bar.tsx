/**
 * Composer top bar — proposal title, status, Preview / Export PDF, and
 * a disabled "Converter para Contrato" stub that previews which blocks
 * would migrate to the future Contract Composer.
 */
import { useState } from "react";
import { FileDown, Printer, FileSignature } from "lucide-react";
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
import { useUpdateProposal } from "@/lib/psa-proposal/use-psa-proposal";
import type {
  PsaProposal,
  PsaProposalBlock,
  PsaProposalStatus,
} from "@/lib/psa-proposal/types";
import { ConvertToContractDialog } from "./convert-to-contract-dialog";

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
        <Button
          size="sm"
          onClick={() => {
            window.print();
            toast.message("Use 'Guardar como PDF' no diálogo de impressão.");
          }}
        >
          <FileDown className="mr-1 h-3.5 w-3.5" /> Exportar PDF
        </Button>
      </div>
      <ConvertToContractDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        blocks={blocks}
      />
    </div>
  );
}
