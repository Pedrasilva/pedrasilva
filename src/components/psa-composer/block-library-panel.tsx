/**
 * Block library panel — left sidebar.
 * Shows all library entries grouped by canonical PSA order; click to append
 * a new block to the proposal.
 */
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useBlockLibrary, useAddLibraryBlock } from "@/lib/psa-proposal/use-psa-proposal";
import { useLiveQuoteSnapshot } from "@/lib/psa-proposal/live-data";
import { RelevanceBadge } from "./relevance-badge";
import type { PsaProposalBlock, PsaLibraryEntry } from "@/lib/psa-proposal/types";

export function BlockLibraryPanel({
  proposalId,
  blocks,
  quoteIdHint,
  selectedId,
  onInserted,
}: {
  proposalId: string;
  blocks: PsaProposalBlock[];
  quoteIdHint?: string | null;
  selectedId?: string | null;
  onInserted?: (id: string) => void;
}) {
  const lib = useBlockLibrary();
  const add = useAddLibraryBlock(proposalId);
  const live = useLiveQuoteSnapshot(quoteIdHint ?? null);
  const [q, setQ] = useState("");

  const items =
    lib.data?.filter((l) =>
      !q ? true : l.label.toLowerCase().includes(q.toLowerCase()),
    ) ?? [];

  const sorted = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
  const selectedBlock = selectedId ? sorted.find((b) => b.id === selectedId) : null;
  const lastOrder = sorted.length ? sorted[sorted.length - 1].sort_order : 0;
  const afterOrder = selectedBlock ? selectedBlock.sort_order : lastOrder;

  const manualEntries: PsaLibraryEntry[] = [
    {
      id: "custom",
      kind: "custom_text",
      label: "Texto Livre",
      default_title: "Novo bloco",
      default_content_rich: { text: "" },
      default_source_type: "manual",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "gantt-partial",
      kind: "gantt_partial",
      label: "Gantt Parcial",
      default_title: "Cronograma — Fase",
      default_content_rich: {},
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "supplier-fee-table",
      kind: "supplier_fee_table",
      label: "Honorários Fornecedores",
      default_title: "Honorários — Fornecedores",
      default_content_rich: {},
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "optional-fee-table",
      kind: "optional_fee_table",
      label: "Honorários Opcionais",
      default_title: "Serviços Opcionais",
      default_content_rich: {},
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },

    {
      id: "page-break",
      kind: "page_break",
      label: "Quebra de Página",
      default_title: "Quebra de Página",
      default_content_rich: {},
      default_source_type: "manual",
      default_source_ref: {},
      default_contract_relevance: "both",
      sort_hint: 999,
      is_system: false,
    },
  ];
  const filteredManual = manualEntries.filter((l) =>
    !q ? true : l.label.toLowerCase().includes(q.toLowerCase()),
  );




  function pickNextStageId(): string | undefined {
    const stages = (live.data?.stages ?? []).filter(
      (s) => s.isSelf && !s.isMilestone,
    );
    if (!stages.length) return undefined;
    const used = new Set(
      blocks
        .filter((b) => b.block_type === "stage_item")
        .map((b) => (b.source_ref as { stage_id?: string } | undefined)?.stage_id)
        .filter(Boolean) as string[],
    );
    return (stages.find((s) => !used.has(s.id)) ?? stages[0]).id;
  }

  function addBlock(libEntry: PsaLibraryEntry) {
    let entry = libEntry;
    if (libEntry.kind === "stage_item") {
      const stageId = pickNextStageId();
      if (stageId) {
        entry = {
          ...libEntry,
          default_source_ref: { ...(libEntry.default_source_ref ?? {}), stage_id: stageId },
        };
      }
    }
    add.mutate(
      { lib: entry, afterOrder },
      {
        onSuccess: (res) => {
          toast.success(`Bloco "${entry.default_title}" adicionado`);
          onInserted?.(res.id);
          // Scroll the newly inserted block into view after re-render.

          setTimeout(() => {
            const el = document.querySelector(
              `[data-proposal-block-id="${res.id}"]`,
            );
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 250);
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Erro ao adicionar bloco";
          toast.error(msg);
        },
      },
    );
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-muted/30 xl:w-64">
      <div className="border-b px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Biblioteca de Blocos
        </div>
      </div>
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Procurar bloco..."
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <ul className="space-y-1 p-2">
          {items.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => addBlock(l)}
                className="group flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.label}</div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <RelevanceBadge value={l.default_contract_relevance} />
                  </div>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-blue-500" />
              </button>
            </li>
          ))}
          {filteredManual.map((l) => (
            <li key={`manual-${l.id}`}>
              <button
                type="button"
                onClick={() => addBlock(l)}
                className="group flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.label}</div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <RelevanceBadge value={l.default_contract_relevance} />
                  </div>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-blue-500" />
              </button>
            </li>
          ))}
          {!items.length && !filteredManual.length && (
            <li className="px-2 py-4 text-center text-xs text-zinc-500">
              Sem resultados.
            </li>
          )}
        </ul>
      </ScrollArea>
    </aside>
  );
}
