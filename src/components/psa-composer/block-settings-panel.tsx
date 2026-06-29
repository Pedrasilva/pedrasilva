/**
 * Block settings panel — right sidebar.
 *
 * Lets the user edit title, source_type, source_ref (quote id), rich content,
 * contract_relevance, visibility, lock, per-block page-break-before, plus
 * stage selection for the Individual Stage block and a deliverables list.
 */
import { useEffect, useState } from "react";
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
import { useLiveQuoteSnapshot } from "@/lib/psa-proposal/live-data";

export function BlockSettingsPanel({
  proposalId,
  quoteIdHint,
  block,
}: {
  proposalId: string;
  quoteIdHint: string | null;
  block: PsaProposalBlock | null;
}) {
  const update = useUpdateBlock(proposalId);
  const del = useDeleteBlock(proposalId);
  const dup = useDuplicateBlock(proposalId);

  const [title, setTitle] = useState(block?.title ?? "");

  useEffect(() => {
    setTitle(block?.title ?? "");
  }, [block?.id, block?.title]);

  // Always call hooks — pass null when no block to keep order stable.
  const sourceRef = (block?.source_ref ?? {}) as { quote_id?: string; stage_id?: string };
  const effectiveQuoteId = sourceRef.quote_id ?? quoteIdHint ?? "";
  const liveQuery = useLiveQuoteSnapshot(effectiveQuoteId || null);

  if (!block) {
    return (
      <aside className="flex h-full w-72 shrink-0 flex-col border-l bg-muted/30 p-4 text-sm text-zinc-500 xl:w-80">
        Selecione um bloco para editar.
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
    block.source_type === "mixed";

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
              {(liveQuery.data?.stages ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code ? `${s.code} — ` : ""}{s.name}
                </SelectItem>
              ))}
              {!liveQuery.data?.stages?.length && (
                <div className="px-2 py-1.5 text-xs text-zinc-500">
                  Defina primeiro o Quote ID acima.
                </div>
              )}
            </SelectContent>
          </Select>
          <div className="pt-2">
            <Label className="text-xs">Entregáveis (um por linha)</Label>
            <Textarea
              rows={4}
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
        </div>
      )}

      {supportsRich && (
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
          />
          <p className="text-[10px] text-zinc-500">
            Suporta negrito, itálico, sublinhado, títulos, listas, tabelas e links. Aceita
            colar do Word.
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
