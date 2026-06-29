/**
 * 3-pane shell: library (L) · canvas (C) · settings (R) + top bar.
 * Owns the selected-block state.
 */
import { useState, useMemo } from "react";
import { ComposerTopBar } from "./composer-top-bar";
import { ComposerCanvas } from "./canvas";
import { BlockLibraryPanel } from "./block-library-panel";
import { BlockSettingsPanel } from "./block-settings-panel";
import {
  useProposal,
  useProposalBlocks,
  useReorderBlocks,
} from "@/lib/psa-proposal/use-psa-proposal";

export function ComposerShell({ proposalId }: { proposalId: string }) {
  const proposal = useProposal(proposalId);
  const blocks = useProposalBlocks(proposalId);
  const reorder = useReorderBlocks(proposalId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useMemo(() => blocks.data ?? [], [blocks.data]);
  const selected = items.find((b) => b.id === selectedId) ?? null;

  if (!proposal.data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        A carregar proposta...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <ComposerTopBar proposal={proposal.data} />
      <div className="flex min-h-0 flex-1 overflow-hidden print:block">
        <div className="print:hidden">
          <BlockLibraryPanel proposalId={proposalId} blocks={items} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-zinc-100 print:overflow-visible print:bg-white">
          <ComposerCanvas
            blocks={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={(next) => reorder.mutate(next)}
          />
        </div>
        <div className="print:hidden">
          <BlockSettingsPanel
            proposalId={proposalId}
            quoteIdHint={proposal.data.quote_id}
            block={selected}
          />
        </div>
      </div>
    </div>
  );
}
