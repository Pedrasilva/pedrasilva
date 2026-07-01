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
import { useUpdateBlock } from "@/lib/psa-proposal/use-psa-proposal";

// Blocks whose primary content is free rich text — editable inline on canvas.
const INLINE_EDITABLE_TYPES: PsaBlockType[] = [
  "about",
  "scope",
  "stage_list",
  "stage_item",
  "custom_text",
  "construction_fee",
  "payment_terms",
  "additional_services",
  "general",
  "suspension",
  "exclusions",
];

const NON_NUMBERED: PsaBlockType[] = ["cover", "index", "acceptance", "page_break"];

function SortableRow({
  block,
  chapter,
  toc,
  selected,
  quoteIdHint,
  onSelect,
  onPatchContent,
}: {
  block: PsaProposalBlock;
  chapter: number | null;
  toc: { chapter: number; title: string }[];
  selected: boolean;
  quoteIdHint: string | null;
  onSelect: () => void;
  onPatchContent: (patch: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const refQuoteId = (block.source_ref as { quote_id?: string } | undefined)?.quote_id;
  const useLive =
    block.source_type === "live_quote" ||
    block.source_type === "mixed" ||
    block.block_type === "stage_item" ||
    block.block_type === "index";
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
      data-proposal-block-id={block.id}
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
      <BlockBody
        block={block}
        live={live}
        chapterNumber={chapter}
        toc={toc}
        editable={selected && INLINE_EDITABLE_TYPES.includes(block.block_type) && !block.is_locked}
        onPatchContent={onPatchContent}
      />
    </div>
  );
}


export function ComposerCanvas({
  proposalId,
  blocks,
  selectedId,
  onSelect,
  onReorder,
  quoteIdHint,
  styleSettings,
}: {
  proposalId: string;
  blocks: PsaProposalBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (next: PsaProposalBlock[]) => void;
  quoteIdHint: string | null;
  styleSettings?: import("@/lib/psa-proposal/types").PsaProposalStyleSettings;
}) {
  const update = useUpdateBlock(proposalId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { chapterByIndex, toc } = useMemo(() => {
    let n = 0;
    const idx: (number | null)[] = [];
    const t: { chapter: number; title: string }[] = [];
    for (const b of blocks) {
      if (NON_NUMBERED.includes(b.block_type) || !b.is_visible) {
        idx.push(null);
        continue;
      }
      n += 1;
      idx.push(n);
      t.push({ chapter: n, title: b.title || b.block_type });
    }
    return { chapterByIndex: idx, toc: t };
  }, [blocks]);


  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((b) => b.id === active.id);
    const newIdx = blocks.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(blocks, oldIdx, newIdx));
  }

  const showHeader = styleSettings?.showHeader !== false;
  const showFooter = styleSettings?.showFooter !== false;
  const headerBrand = styleSettings?.headerBrand ?? "PEDRA SILVA";
  const headerBrandSub = styleSettings?.headerBrandSub ?? "ARCHITECTS";
  const headerEmail = styleSettings?.headerContactEmail ?? "info@pedrasilva.com";
  const headerWebsite = styleSettings?.headerContactWebsite ?? "www.pedrasilva.com";
  const footerAddress = styleSettings?.footerAddress ?? "Trav. Corpo Santo 10, 1.ºD\n1200-131 Lisboa, Portugal";

  const styleVars: React.CSSProperties = {};
  if (styleSettings?.headingFont) (styleVars as Record<string, string>)["--psa-heading-font"] = styleSettings.headingFont;
  if (styleSettings?.bodyFont) (styleVars as Record<string, string>)["--psa-body-font"] = styleSettings.bodyFont;
  if (styleSettings?.headingWeight) (styleVars as Record<string, string>)["--psa-heading-weight"] = String(styleSettings.headingWeight);
  if (styleSettings?.bodyAlign) (styleVars as Record<string, string>)["--psa-body-align"] = styleSettings.bodyAlign;
  if (styleSettings?.bodySize) (styleVars as Record<string, string>)["--psa-body-size"] = `${styleSettings.bodySize}pt`;
  if (styleSettings?.headingScale) (styleVars as Record<string, string>)["--psa-heading-scale"] = String(styleSettings.headingScale);
  if (styleSettings?.marginTop != null) (styleVars as Record<string, string>)["--psa-margin-top"] = `${styleSettings.marginTop}mm`;
  if (styleSettings?.marginBottom != null) (styleVars as Record<string, string>)["--psa-margin-bottom"] = `${styleSettings.marginBottom}mm`;

  return (
    <div className="print-area">
      <div className="proposal-print-document" style={styleVars}>
        {/* PSA running header — fixed in print so it repeats per page.
            Content is editable via the Style panel. */}
        {showHeader && (
          <div className="proposal-page-header">
            <div className="proposal-letterhead-brand">
              {headerBrand && <span className="proposal-letterhead-brand-line">{headerBrand}</span>}
              {headerBrandSub && <span className="proposal-letterhead-brand-sub">{headerBrandSub}</span>}
            </div>
            <div className="proposal-letterhead-contact">
              {headerEmail && <div>{headerEmail}</div>}
              {headerWebsite && (
                <a href={headerWebsite.startsWith("http") ? headerWebsite : `https://${headerWebsite}`} target="_blank" rel="noreferrer">{headerWebsite}</a>
              )}
            </div>
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3 pl-6 print:space-y-0 print:pl-0">
              {blocks.map((b, i) => (
                <SortableRow
                  key={b.id}
                  block={b}
                  chapter={chapterByIndex[i]}
                  toc={toc}
                  selected={selectedId === b.id}
                  quoteIdHint={quoteIdHint}
                  onSelect={() => onSelect(b.id)}
                  onPatchContent={(patch) =>
                    update.mutate({
                      id: b.id,
                      patch: {
                        content_rich: { ...(b.content_rich ?? {}), ...patch },
                      },
                    })
                  }
                />
              ))}

            </div>
          </SortableContext>
        </DndContext>

        {/* PSA running footer — address bottom-left, marks bottom-right. */}
        <div className="proposal-page-footer">
          <div className="proposal-page-address">
            Trav. Corpo Santo 10, 1.ºD<br />
            1200-131 Lisboa, Portugal
          </div>
        </div>
      </div>
    </div>
  );
}
