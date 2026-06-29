/**
 * Block library panel — left sidebar.
 * Shows all library entries grouped by canonical PSA order; click to append
 * a new block to the proposal.
 */
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBlockLibrary, useAddLibraryBlock } from "@/lib/psa-proposal/use-psa-proposal";
import { RelevanceBadge } from "./relevance-badge";
import type { PsaProposalBlock } from "@/lib/psa-proposal/types";

export function BlockLibraryPanel({
  proposalId,
  blocks,
}: {
  proposalId: string;
  blocks: PsaProposalBlock[];
}) {
  const lib = useBlockLibrary();
  const add = useAddLibraryBlock(proposalId);
  const [q, setQ] = useState("");

  const items =
    lib.data?.filter((l) =>
      !q ? true : l.label.toLowerCase().includes(q.toLowerCase()),
    ) ?? [];

  const lastOrder = blocks.length
    ? Math.max(...blocks.map((b) => b.sort_order))
    : 0;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-muted/30">
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
                onClick={() =>
                  add.mutate({ lib: l, afterOrder: lastOrder })
                }
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
          {!items.length && (
            <li className="px-2 py-4 text-center text-xs text-zinc-500">
              Sem resultados.
            </li>
          )}
        </ul>
      </ScrollArea>
      <div className="border-t p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            add.mutate({
              lib: {
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
              afterOrder: lastOrder,
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Texto Livre
        </Button>
      </div>
    </aside>
  );
}
