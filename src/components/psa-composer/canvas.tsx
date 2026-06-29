/**
 * Composer canvas — paginated A4-style document.
 *
 * Renders ordered blocks vertically with PSA chrome (header logo line,
 * footer with auto page numbers) and supports reordering via dnd-kit.
 * Chapter numbers are computed from block order, skipping cover/index/
 * acceptance/page_break.
 */
import { useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PsaProposalBlock, PsaBlockType } from "@/lib/psa-proposal/types";
import { BlockBody } from "./block-renderer";
import { RelevanceBadge } from "./relevance-badge";
import { useLiveQuoteSnapshot } from "@/lib/psa-proposal/live-data";

const NON_NUMBERED: PsaBlockType[] = ["cover", "index", "acceptance", "page_break"];

function SortableRow({
  block,
  chapter,
  selected,
  onSelect,
}: {
  block: PsaProposalBlock;
  chapter: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const live = useLiveQuoteSnapshot(
    (block.source_type === "live_quote" || block.source_type === "mixed") &&
      block.source_ref &&
      (block.source_ref as { quote_id?: string }).quote_id
      ? ((block.source_ref as { quote_id?: string }).quote_id as string)
      : null,
  ).data;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        "group relative rounded-md border bg-white px-8 py-6 shadow-sm transition",
        selected ? "border-blue-400 ring-1 ring-blue-300" : "border-zinc-200 hover:border-zinc-300",
        !block.is_visible && "opacity-60",
      )}
    >
      <div className="absolute left-1 top-1 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-1 text-zinc-400 hover:bg-zinc-100"
          aria-label="Reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2 text-[10px] text-zinc-500">
        <RelevanceBadge value={block.contract_relevance} />
        <span className="uppercase tracking-widest">{block.block_type}</span>
        {!block.is_visible && <EyeOff className="h-3 w-3" />}
        {block.is_locked && <Lock className="h-3 w-3" />}
      </div>
      <BlockBody block={block} live={live} chapterNumber={chapter} />
    </div>
  );
}

export function ComposerCanvas({
  blocks,
  selectedId,
  onSelect,
  onReorder,
}: {
  blocks: PsaProposalBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (next: PsaProposalBlock[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const chapterByIndex = useMemo(() => {
    let n = 0;
    return blocks.map((b) => {
      if (NON_NUMBERED.includes(b.block_type) || !b.is_visible) return null;
      n += 1;
      return n;
    });
  }, [blocks]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((b) => b.id === active.id);
    const newIdx = blocks.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(blocks, oldIdx, newIdx));
  }

  return (
    <div className="mx-auto max-w-[210mm] space-y-4 p-6">
      {/* PSA header band */}
      <div className="flex items-end justify-between border-b border-zinc-300 pb-2 text-[10px] uppercase tracking-widest text-zinc-500">
        <div className="font-semibold text-zinc-900">Pedra Silva Arquitectos</div>
        <div>Lisboa · Portugal · geral@pedrasilva.pt</div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {blocks.map((b, i) => (
              <SortableRow
                key={b.id}
                block={b}
                chapter={chapterByIndex[i]}
                selected={selectedId === b.id}
                onSelect={() => onSelect(b.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* PSA footer band */}
      <div className="mt-8 border-t border-zinc-300 pt-2 text-center text-[10px] text-zinc-500">
        Pedra Silva Arquitectos · Rua Exemplo, Lisboa · NIF 000 000 000
      </div>
    </div>
  );
}
