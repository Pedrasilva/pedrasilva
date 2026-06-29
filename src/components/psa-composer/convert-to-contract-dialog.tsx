/**
 * "Converter para Contrato" stub dialog.
 *
 * Shows which proposal blocks would migrate into the future Contract Composer
 * (those flagged `contract_relevant` or `both`). Does not perform any write.
 * The action button is disabled — wiring to the contract composer ships later.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RelevanceBadge } from "./relevance-badge";
import { BLOCK_TYPE_LABEL } from "@/lib/psa-proposal/use-psa-proposal";
import type { PsaProposalBlock } from "@/lib/psa-proposal/types";

export function ConvertToContractDialog({
  open,
  onOpenChange,
  blocks,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blocks: PsaProposalBlock[];
}) {
  const migrating = blocks.filter(
    (b) => b.contract_relevance === "contract_relevant" || b.contract_relevance === "both",
  );
  const skipped = blocks.filter(
    (b) => b.contract_relevance === "proposal_only" || b.contract_relevance === "internal_only",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Converter para Contrato</DialogTitle>
          <DialogDescription>
            Pré-visualização da migração. O Compositor de Contratos será lançado
            numa próxima fase — por agora, apenas mostramos quais blocos serão
            transformados em cláusulas contratuais.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-700">
              Migram ({migrating.length})
            </h4>
            <ul className="space-y-1 rounded-md border bg-emerald-50/40 p-2 text-sm">
              {migrating.length ? (
                migrating.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span className="text-zinc-400">{BLOCK_TYPE_LABEL[b.block_type]} · </span>
                      {b.title}
                    </span>
                    <RelevanceBadge value={b.contract_relevance} />
                  </li>
                ))
              ) : (
                <li className="text-xs italic text-zinc-500">Nenhum bloco marcado como contratual.</li>
              )}
            </ul>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Permanecem na proposta ({skipped.length})
            </h4>
            <ul className="space-y-1 rounded-md border bg-zinc-50 p-2 text-sm">
              {skipped.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="text-zinc-400">{BLOCK_TYPE_LABEL[b.block_type]} · </span>
                    {b.title}
                  </span>
                  <RelevanceBadge value={b.contract_relevance} />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button disabled title="Compositor de Contratos em desenvolvimento">
            Converter (em breve)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
