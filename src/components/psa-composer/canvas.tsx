/**
 * Composer canvas — A4 print-aware document.
 *
 * Renders ordered blocks vertically inside a `.proposal-print-document` sheet
 * with PSA header/footer (fixed on print so they repeat per page) and a set
 * of page-break / break-inside rules defined in src/styles.css. Blocks support
 * a per-block `content_rich.pageBreakBefore` flag that maps to the
 * `proposal-page-break-before` class — honoured both in the screen preview
 * (visible A4 dashed boundaries) and in the printed PDF.
 *
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
  quoteIdHint,
  onSelect,
}: {
  block: PsaProposalBlock;
  chapter: number | null;
  selected: boolean;
  quoteIdHint: string | null;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const refQuoteId = (block.source_ref as { quote_id?: string } | undefined)?.quote_id;
  const useLive =
    block.source_type === "live_quote" ||
    block.source_type === "mixed" ||
    block.block_type === "stage_item";
  const live = useLiveQuoteSnapshot(useLive ? refQuoteId ?? quoteIdHint : null).data;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  const pageBreakBefore = Boolean(
    (block.content_rich as { pageBreakBefore?: boolean } | undefined)?.pageBreakBefore,
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        "proposal-print-block group relative mb-4 rounded-md transition print:mb-0 print:rounded-none",
        // Screen-only chrome: thin selection border, never on print.
        "border border-transparent print:border-0",
        selected
          ? "border-blue-400 ring-1 ring-blue-300 print:ring-0"
          : "hover:border-zinc-200",
        !block.is_visible && "opacity-60 print:hidden",
        pageBreakBefore && "proposal-page-break-before",
      )}
    >
      <div className="absolute -left-6 top-1 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 print:hidden">
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
      <div className="mb-2 flex items-center gap-2 text-[10px] text-zinc-500 print:hidden">
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
  quoteIdHint,
}: {
  blocks: PsaProposalBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (next: PsaProposalBlock[]) => void;
  quoteIdHint: string | null;
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
    <div className="print-area">
      <div className="proposal-print-document">
        {/* PSA running header — `position: fixed` in print so it repeats per page */}
        <div className="proposal-page-header flex items-end justify-between border-b border-zinc-300 pb-2 text-[10px] uppercase tracking-widest text-zinc-500">
          <div className="font-semibold text-zinc-900">Pedra Silva Arquitectos</div>
          <div>Lisboa · Portugal · geral@pedrasilva.pt</div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3 pl-6 print:space-y-0 print:pl-0">
              {blocks.map((b, i) => (
                <SortableRow
                  key={b.id}
                  block={b}
                  chapter={chapterByIndex[i]}
                  selected={selectedId === b.id}
                  quoteIdHint={quoteIdHint}
                  onSelect={() => onSelect(b.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* PSA running footer */}
        <div className="proposal-page-footer border-t border-zinc-300 pt-2 text-center text-[10px] text-zinc-500">
          Pedra Silva Arquitectos · Rua Exemplo, Lisboa · NIF 000 000 000
        </div>
      </div>
    </div>
  );
}
