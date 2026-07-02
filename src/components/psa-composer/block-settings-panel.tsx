/**
 * Block settings panel — right sidebar.
 *
 * Lets the user edit title, source_type, source_ref (quote id), rich content,
 * contract_relevance, visibility, lock, per-block page-break-before, plus
 * stage selection for the Individual Stage block and a deliverables list.
 */
import { useEffect, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUpdateBlock,
  useDeleteBlock,
  useDuplicateBlock,
} from "@/lib/psa-proposal/use-psa-proposal";
import {
  RELEVANCE_LABEL,
  SOURCE_LABEL,
  type PsaContractRelevance,
  type PsaProposalBlock,
  type PsaSourceType,
} from "@/lib/psa-proposal/types";
import { RelevanceBadge } from "./relevance-badge";
import { RichTextEditor } from "./rich-text-editor";
import { useLiveQuoteSnapshot, type LiveStage } from "@/lib/psa-proposal/live-data";
import { buildTokenPickerEntries } from "@/lib/psa-proposal/tokens";
import { ProposalStylePanel } from "./proposal-style-panel";
import type { PsaProposal } from "@/lib/psa-proposal/types";
import {
  buildStageNumberMap,
  compareWbsNumbers,
  formatStageLabel,
} from "@/lib/quotes/stage-numbering";

export function BlockSettingsPanel({
  proposalId,
  proposal,
  quoteIdHint,
  block,
}: {
  proposalId: string;
  proposal: PsaProposal;
  quoteIdHint: string | null;
  block: PsaProposalBlock | null;
}) {
  const update = useUpdateBlock(proposalId);
  const del = useDeleteBlock(proposalId);
  const dup = useDuplicateBlock(proposalId);

  const [title, setTitle] = useState(block?.title ?? "");
  const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(block?.title ?? "");
  }, [block?.id, block?.title]);

  // Debounced autosave for the title so a refresh mid-edit doesn't lose it.
  useEffect(() => {
    if (!block) return;
    if (title === block.title) return;
    if (titleDebounce.current) clearTimeout(titleDebounce.current);
    titleDebounce.current = setTimeout(() => {
      update.mutate({ id: block.id, patch: { title } });
    }, 600);
    return () => {
      if (titleDebounce.current) clearTimeout(titleDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, block?.id]);

  // Always call hooks — pass null when no block to keep order stable.
  const sourceRef = (block?.source_ref ?? {}) as { quote_id?: string; stage_id?: string; parent_stage_id?: string };
  const effectiveQuoteId = sourceRef.quote_id ?? quoteIdHint ?? "";
  const liveQuery = useLiveQuoteSnapshot(effectiveQuoteId || null);

  // Number stages with the WBS/Gantt scheme and sort by that number so the
  // dropdown mirrors the Gantt outline exactly.
  const numberedStages = (() => {
    const raw = liveQuery.data?.stages ?? [];
    const numberable = raw.map((s: LiveStage) => ({
      id: s.id,
      name: s.name,
      sort_order: s.sortOrder,
      parent_stage_id: s.parentStageId,
    }));
    const numMap = buildStageNumberMap(numberable);
    return [...raw]
      .sort((a, b) => compareWbsNumbers(numMap.get(a.id), numMap.get(b.id)))
      .map((s) => ({ stage: s, number: numMap.get(s.id) }));
  })();

  if (!block) {
    return (
      <aside className="flex h-full w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-muted/30 p-3 text-sm xl:w-80">
        <ProposalStylePanel proposal={proposal} />
        <div className="mt-2 rounded-md border border-dashed bg-background/60 p-2 text-[11px] text-zinc-500">
          Selecione um bloco para editar o seu conteúdo.
        </div>
      </aside>
    );
  }

  const html = (block.content_rich?.html as string | undefined) ?? "";
  const legacyText = (block.content_rich?.text as string | undefined) ?? "";
  const pageBreakBefore = Boolean(
    (block.content_rich as { pageBreakBefore?: boolean } | undefined)?.pageBreakBefore,
  );

  const supportsRich =
    block.source_type === "manual" ||
    block.source_type === "library" ||
    block.source_type === "mixed" ||
    block.block_type === "stage_item" ||
    block.block_type === "stage_list" ||
    block.block_type === "timeline" ||
    block.block_type === "fee_table" ||
    block.block_type === "supplier_fee_table" ||
    block.block_type === "optional_fee_table";



  return (
    <aside className="flex h-full w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-muted/30 p-3 text-sm xl:w-80">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Definições do Bloco
        </div>
        <RelevanceBadge value={block.contract_relevance} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Título</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() =>
            title !== block.title &&
            update.mutate({ id: block.id, patch: { title } })
          }
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Tipo de origem</Label>
        <Select
          value={block.source_type}
          onValueChange={(v) =>
            update.mutate({
              id: block.id,
              patch: { source_type: v as PsaSourceType },
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SOURCE_LABEL) as PsaSourceType[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SOURCE_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(block.source_type === "live_quote" || block.source_type === "mixed") && (
        <div className="space-y-1">
          <Label className="text-xs">Quote ID (origem live)</Label>
          <Input
            value={effectiveQuoteId}
            onChange={(e) =>
              update.mutate({
                id: block.id,
                patch: {
                  source_ref: { ...sourceRef, quote_id: e.target.value },
                },
              })
            }
            placeholder="uuid do orçamento"
          />
        </div>
      )}

      {block.block_type === "stage_item" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Fase do orçamento</Label>
            <Select
              value={sourceRef.stage_id ?? ""}
              onValueChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: { source_ref: { ...sourceRef, stage_id: v } },
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolher fase..." />
              </SelectTrigger>
              <SelectContent>
                {numberedStages.map(({ stage: s, number }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {formatStageLabel({ id: s.id, name: s.name }, number)}
                  </SelectItem>
                ))}
                {!liveQuery.data?.stages?.length && (
                  <div className="px-2 py-1.5 text-xs text-zinc-500">
                    Defina primeiro o Quote ID acima.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Conteúdo</Label>
            <RichTextEditor
              value={html || (legacyText ? `<p>${legacyText.replace(/\n/g, "</p><p>")}</p>` : "")}
              onChange={({ html, text }) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: { ...(block.content_rich ?? {}), html, text },
                  },
                })
              }
              placeholder="Descrição livre desta fase..."
              tokenEntries={buildTokenPickerEntries(liveQuery.data)}
            />
            <p className="text-[10px] text-zinc-500">
              Use <code className="rounded bg-zinc-100 px-1">{"{{token}}"}</code> ou
              "Inserir do orçamento" para puxar dados do quote.
            </p>
          </div>

          <div>
            <Label className="text-xs">Entregáveis (texto livre)</Label>
            <Textarea
              rows={10}
              className="min-h-[220px]"
              value={(block.content_rich?.deliverables as string | undefined) ?? ""}
              onChange={(e) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      deliverables: e.target.value,
                    },
                  },
                })
              }
              placeholder="Memória descritiva&#10;Planos cotados&#10;Cortes e alçados"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border bg-background p-2">
            <Label className="text-xs">Mostrar "Informação necessária do cliente"</Label>
            <Switch
              checked={
                (block.content_rich?.client_info_visible as boolean | undefined) ?? true
              }
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      client_info_visible: v,
                    },
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border bg-background p-2">
            <Label className="text-xs">Mostrar tabela "Recursos afectos"</Label>
            <Switch
              checked={
                (block.content_rich?.resources_visible as boolean | undefined) ?? true
              }
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      resources_visible: v,
                    },
                  },
                })
              }
            />
          </div>


          {((block.content_rich?.client_info_visible as boolean | undefined) ?? true) && (
            <div>
              <Label className="text-xs">Informação necessária do cliente (uma por linha)</Label>
              <Textarea
                rows={5}
                value={(block.content_rich?.client_info as string | undefined) ?? ""}
                onChange={(e) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: {
                        ...(block.content_rich ?? {}),
                        client_info: e.target.value,
                      },
                    },
                  })
                }
                placeholder="Levantamento topográfico&#10;Indicações de orçamento&#10;Desenhos existentes&#10;Objetivos do projeto"
              />
            </div>
          )}
        </div>
      )}

      {(block.block_type === "gantt_partial" ||
        block.block_type === "gantt_design" ||
        block.block_type === "gantt_construction") && (
        <div className="space-y-1">
          <Label className="text-xs">
            Fase pai {block.block_type === "gantt_partial" ? "(obrigatória)" : "(opcional — sobrepõe deteção automática)"}
          </Label>
          <Select
            value={sourceRef.parent_stage_id ?? ""}
            onValueChange={(v) =>
              update.mutate({
                id: block.id,
                patch: {
                  source_ref: {
                    ...sourceRef,
                    parent_stage_id: v === "__auto__" ? undefined : v,
                  },
                },
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolher fase pai..." />
            </SelectTrigger>
            <SelectContent>
              {block.block_type !== "gantt_partial" && (
                <SelectItem value="__auto__">Automático</SelectItem>
              )}
              {numberedStages
                .filter(({ stage: s }) => s.isSelf && !s.isMilestone)
                .map(({ stage: s, number }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {formatStageLabel({ id: s.id, name: s.name }, number)}
                  </SelectItem>
                ))}
              {!liveQuery.data?.stages?.length && (
                <div className="px-2 py-1.5 text-xs text-zinc-500">
                  Defina primeiro o Quote ID acima.
                </div>
              )}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-zinc-500">
            Renderiza um Gantt simplificado com todas as sub-fases desta fase pai.
          </p>
        </div>
      )}

      {supportsRich && block.block_type !== "stage_item" && (
        <div className="space-y-1">
          <Label className="text-xs">Conteúdo</Label>
          <RichTextEditor
            value={html || (legacyText ? `<p>${legacyText.replace(/\n/g, "</p><p>")}</p>` : "")}
            onChange={({ html, text }) =>
              update.mutate({
                id: block.id,
                patch: {
                  content_rich: { ...(block.content_rich ?? {}), html, text },
                },
              })
            }
            placeholder="Escreva o conteúdo deste bloco..."
            tokenEntries={buildTokenPickerEntries(liveQuery.data)}
          />
          <p className="text-[10px] text-zinc-500">
            Suporta negrito, itálico, sublinhado, títulos, listas, tabelas e links. Use{" "}
            <code className="rounded bg-zinc-100 px-1">{"{{token}}"}</code> ou o menu
            "Inserir do orçamento" para puxar dados do quote.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Relevância contratual</Label>
        <Select
          value={block.contract_relevance}
          onValueChange={(v) =>
            update.mutate({
              id: block.id,
              patch: { contract_relevance: v as PsaContractRelevance },
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RELEVANCE_LABEL) as PsaContractRelevance[]).map((k) => (
              <SelectItem key={k} value={k}>
                {RELEVANCE_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-md border bg-background p-2">
        <Label className="text-xs">Visível</Label>
        <Switch
          checked={block.is_visible}
          onCheckedChange={(v) =>
            update.mutate({ id: block.id, patch: { is_visible: v } })
          }
        />
      </div>
      <div className="flex items-center justify-between rounded-md border bg-background p-2">
        <Label className="text-xs">Layout bloqueado</Label>
        <Switch
          checked={block.is_locked}
          onCheckedChange={(v) =>
            update.mutate({ id: block.id, patch: { is_locked: v } })
          }
        />
      </div>
      <div className="flex items-center justify-between rounded-md border bg-background p-2">
        <Label className="text-xs">Quebra de página antes</Label>
        <Switch
          checked={pageBreakBefore}
          onCheckedChange={(v) =>
            update.mutate({
              id: block.id,
              patch: {
                content_rich: { ...(block.content_rich ?? {}), pageBreakBefore: v },
              },
            })
          }
        />
      </div>

      <div className="space-y-2 rounded-md border bg-background p-2">
        <Label className="text-xs font-semibold">Alinhar na página</Label>
        <p className="text-[10px] text-zinc-500">
          Faz o bloco ocupar uma página inteira e ancora o conteúdo ao canto escolhido (ex.: canto inferior esquerdo).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-zinc-500">Vertical</Label>
            <Select
              value={(block.content_rich?.pageAlignY as string | undefined) ?? "none"}
              onValueChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: { ...(block.content_rich ?? {}), pageAlignY: v },
                  },
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Automático</SelectItem>
                <SelectItem value="top">Topo</SelectItem>
                <SelectItem value="middle">Meio</SelectItem>
                <SelectItem value="bottom">Fundo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-zinc-500">Horizontal</Label>
            <Select
              value={(block.content_rich?.pageAlignX as string | undefined) ?? "none"}
              onValueChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: { ...(block.content_rich ?? {}), pageAlignX: v },
                  },
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Automático</SelectItem>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>


      <div className="mt-auto flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => dup.mutate(block)}
        >
          <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={() => {
            if (confirm("Apagar este bloco?")) del.mutate(block.id);
          }}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
        </Button>
      </div>
    </aside>
  );
}
