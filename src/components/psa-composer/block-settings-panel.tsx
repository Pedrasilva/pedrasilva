/**
 * Block settings panel — right sidebar.
 *
 * Lets the user edit title, source_type, source_ref (quote id),
 * content text, contract_relevance, visibility, lock, and provides
 * duplicate / delete actions.
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
  const [text, setText] = useState((block?.content_rich?.text as string) ?? "");

  useEffect(() => {
    setTitle(block?.title ?? "");
    setText((block?.content_rich?.text as string) ?? "");
  }, [block?.id]);

  if (!block) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col border-l bg-muted/30 p-4 text-sm text-zinc-500">
        Selecione um bloco para editar.
      </aside>
    );
  }

  const sourceRef = (block.source_ref ?? {}) as { quote_id?: string };
  const effectiveQuoteId = sourceRef.quote_id ?? quoteIdHint ?? "";

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col gap-3 border-l bg-muted/30 p-3 text-sm">
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

      <div className="space-y-1">
        <Label className="text-xs">Conteúdo (manual / misto)</Label>
        <Textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() =>
            update.mutate({
              id: block.id,
              patch: { content_rich: { ...(block.content_rich ?? {}), text } },
            })
          }
          placeholder="Texto livre. Em blocos mistos é combinado com dados live."
        />
      </div>

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
