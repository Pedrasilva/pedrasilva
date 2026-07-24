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
import { useMemo, useRef, useState, useEffect } from "react";
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
import { GripVertical, EyeOff, Lock, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PsaProposalBlock, PsaBlockType, PsaLibraryEntry } from "@/lib/psa-proposal/types";
import { BlockBody } from "./block-renderer";
import { RelevanceBadge } from "./relevance-badge";
import { useLiveQuoteSnapshot, resolveProposalLang, type ProposalLang } from "@/lib/psa-proposal/live-data";
import { useAddLibraryBlock, useUpdateBlock } from "@/lib/psa-proposal/use-psa-proposal";
import { useSmartPagination, type ImageSizeBucket } from "./use-smart-pagination";
import { PaginatedPreview } from "./paginated-preview";
import psaLogo from "@/assets/logotipo-psa.jpg.asset.json";

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
  "acceptance",
  "billable_hourly_rate",
  "supplier_fee_table",
  "optional_fee_table",
  "travel_expenses",
  "image",
];


const NON_NUMBERED: PsaBlockType[] = ["cover", "index", "acceptance", "page_break"];

function SortableRow({
  block,
  chapter,
  toc,
  selected,
  quoteIdHint,
  lang,
  onSelect,
  onPatchContent,
  siblings,
  forceBreakBefore,
  isFirstPrintable,
}: {
  block: PsaProposalBlock;
  chapter: number | null;
  toc: { chapter: number; title: string }[];
  selected: boolean;
  quoteIdHint: string | null;
  lang: ProposalLang;
  onSelect: () => void;
  onPatchContent: (patch: Record<string, unknown>) => void;
  siblings: PsaProposalBlock[];
  forceBreakBefore: boolean;
  isFirstPrintable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });
  const refQuoteId = (block.source_ref as { quote_id?: string } | undefined)?.quote_id;
  // A template may contain a quote reference captured from the proposal it
  // was created from. Never let that stale reference override this proposal.
  const resolvedQuoteId = refQuoteId === quoteIdHint ? refQuoteId : quoteIdHint;
  const useLive =
    block.source_type === "live_quote" ||
    block.source_type === "mixed" ||
    block.block_type === "stage_item" ||
    block.block_type === "index" ||
    block.block_type === "travel_expenses";
  const live = useLiveQuoteSnapshot(useLive ? resolvedQuoteId : null, lang).data;


  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    ...(block.block_type === "appendix_gantt"
      ? {
          width: "min(1120px, calc(100vw - 80px))",
          minWidth: "min(1120px, calc(100vw - 80px))",
          maxWidth: "none",
          flex: "none",
          alignSelf: "flex-start",
        }
      : {}),
  };

  const pageBreakBefore = Boolean(
    (block.content_rich as { pageBreakBefore?: boolean } | undefined)?.pageBreakBefore,
  );
  // Index block defaults to page-break-after=true (preserves existing behaviour)
  // but the user can now turn it off so the next block flows on the same page.
  const rawPageBreakAfter = (block.content_rich as { pageBreakAfter?: boolean } | undefined)
    ?.pageBreakAfter;
  const isIndexBlock = block.block_type === "index";
  const pageBreakAfter =
    rawPageBreakAfter !== undefined
      ? Boolean(rawPageBreakAfter)
      : isIndexBlock
        ? true
        : false;
  const contentEnabled =
    (block.content_rich as { enabled?: boolean } | undefined)?.enabled !== false;
  const isAppendix =
    block.block_type === "appendix_index" ||
    block.block_type === "appendix_payment_schedule" ||
    block.block_type === "appendix_gantt" ||
    block.block_type === "appendix_general_terms";
  const isPrintable = block.is_visible && contentEnabled;
  // The index (TOC) block should never stretch to fill a page — its height
  // must follow its content so no whitespace sits below the last entry.
  const rawPageAlignY = (block.content_rich as { pageAlignY?: string } | undefined)?.pageAlignY;
  const rawPageAlignX = (block.content_rich as { pageAlignX?: string } | undefined)?.pageAlignX;
  const pageAlignY = isIndexBlock ? undefined : rawPageAlignY;
  const pageAlignX = isIndexBlock ? undefined : rawPageAlignX;
  const pageAligned =
    (pageAlignY && pageAlignY !== "none") || (pageAlignX && pageAlignX !== "none");

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={chapter != null ? `chapter-${chapter}` : undefined}
      data-proposal-block-id={block.id}
      data-page-aligned={pageAligned ? "true" : undefined}
      data-page-align-y={pageAlignY && pageAlignY !== "none" ? pageAlignY : undefined}
      data-page-align-x={pageAlignX && pageAlignX !== "none" ? pageAlignX : undefined}
      data-smart-break={forceBreakBefore ? "true" : undefined}
      data-visible-print={isPrintable ? "true" : "false"}
      data-first-printable={isFirstPrintable ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "proposal-print-block group relative mb-4 rounded-md transition-colors print:mb-0 print:rounded-none",
        block.block_type === "appendix_gantt" &&
          "proposal-print-block-gantt-landscape",
        // Screen-only chrome: thin selection border, never on print.
        "border border-transparent print:border-0",
        selected
          ? "border-blue-400 ring-1 ring-blue-300 print:ring-0"
          : "hover:border-zinc-200",
        !block.is_visible && "opacity-60 print:hidden",
        !contentEnabled && "print:hidden",
        (pageBreakBefore || isAppendix || block.block_type === "page_break") &&
          isPrintable &&
          "proposal-page-break-before",
        block.block_type === "cover" && isPrintable && "proposal-page-break-after",
        isIndexBlock && isPrintable && pageBreakAfter && "proposal-page-break-after",
        !isIndexBlock && pageBreakAfter && isPrintable && "proposal-page-break-after",
        forceBreakBefore && isPrintable && "proposal-smart-break-screen",
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
      {/* Stable anchor for internal PDF links (used by TOC / appendix index). */}
      <span id={`proposal-block-${block.id}`} className="proposal-anchor" aria-hidden="true" />
      <BlockBody
        block={block}
        live={live}
        chapterNumber={chapter}
        toc={toc}
        editable={selected && INLINE_EDITABLE_TYPES.includes(block.block_type) && !block.is_locked}
        onPatchContent={onPatchContent}
        lang={lang}
        siblings={siblings}
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
  language,
  previewMode = false,
}: {
  proposalId: string;
  blocks: PsaProposalBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (next: PsaProposalBlock[]) => void;
  quoteIdHint: string | null;
  styleSettings?: import("@/lib/psa-proposal/types").PsaProposalStyleSettings;
  language?: string | null;
  previewMode?: boolean;
}) {
  const lang = resolveProposalLang(language);
  const update = useUpdateBlock(proposalId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Resolve live snapshot once to enrich TOC titles (e.g. stage_item blocks
  // often carry the generic title "Fase" — resolve the real phase name).
  const firstQuoteRef = useMemo(() => {
    for (const b of blocks) {
      const rid = (b.source_ref as { quote_id?: string } | undefined)?.quote_id;
      if (rid && rid === quoteIdHint) return rid;
    }
    return null;
  }, [blocks, quoteIdHint]);
  const liveForToc = useLiveQuoteSnapshot(firstQuoteRef ?? quoteIdHint, lang).data;

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
      let title = (b.title ?? "").trim();
      if (b.block_type === "stage_item") {
        const stageId = (b.source_ref as { stage_id?: string } | undefined)?.stage_id;
        const stage = stageId ? liveForToc?.stages.find((s) => s.id === stageId) : undefined;
        if (stage) {
          const parts = [stage.code, stage.name].filter(Boolean) as string[];
          const resolved = parts.join(" — ");
          if (resolved) title = resolved;
        }
      }
      // Strip trailing "(cópia)"/"(copy)" markers from duplicated blocks.
      title = title.replace(/\s*\((?:cópia|copia|copy)\)\s*$/i, "").trim();
      if (!title) title = b.block_type;
      t.push({ chapter: n, title });
    }
    return { chapterByIndex: idx, toc: t };
  }, [blocks, liveForToc]);

  const firstPrintableId = useMemo(
    () =>
      blocks.find(
        (block) =>
          block.is_visible &&
          (block.content_rich as { enabled?: boolean } | undefined)?.enabled !== false,
      )?.id ?? null,
    [blocks],
  );


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
  if (styleSettings?.marginLeft != null) (styleVars as Record<string, string>)["--psa-margin-left"] = `${styleSettings.marginLeft}mm`;
  if (styleSettings?.marginRight != null) (styleVars as Record<string, string>)["--psa-margin-right"] = `${styleSettings.marginRight}mm`;

  // Smart pagination: measure gaps and awkward breaks against the A4 sheet.
  const docRef = useRef<HTMLDivElement | null>(null);
  const paginationKey = useMemo(
    () => blocks.map((b) => `${b.id}:${b.is_visible ? 1 : 0}`).join("|"),
    [blocks],
  );
  const { gaps, forcedBreaks, mmToPx } = useSmartPagination(docRef, paginationKey);
  // Compute page starts from the same physical A4 height used by print. Showing
  // page 1 as well makes the full sheet geometry explicit in the editor.
  const [docHeight, setDocHeight] = useState(0);
  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDocHeight(el.scrollHeight));
    ro.observe(el);
    setDocHeight(el.scrollHeight);
    return () => ro.disconnect();
  }, [paginationKey]);
  const pageMarkers = useMemo(() => {
    if (!mmToPx || mmToPx < 0.1 || docHeight < 100) return [] as { page: number; top: number }[];
    const pageHpx = 297 * mmToPx;
    const count = Math.max(1, Math.ceil(docHeight / pageHpx));
    const out: { page: number; top: number }[] = [];
    for (let i = 0; i < count; i++) out.push({ page: i + 1, top: i * pageHpx });
    return out;
  }, [mmToPx, docHeight]);

  const addLibraryBlock = useAddLibraryBlock(proposalId);

  const insertImagePlaceholder = (afterBlockId: string, size: ImageSizeBucket) => {
    const idx = blocks.findIndex((b) => b.id === afterBlockId);
    if (idx < 0) return;
    const after = blocks[idx];
    // If the preceding block is forcing a page break after itself, disable it
    // so the newly inserted image actually fills the visible gap instead of
    // bouncing to the next page.
    const priorBreakAfter = (after.content_rich as { pageBreakAfter?: boolean } | undefined)
      ?.pageBreakAfter;
    const priorIsIndexDefault =
      after.block_type === "index" && priorBreakAfter === undefined;
    if (priorBreakAfter === true || priorIsIndexDefault) {
      update.mutate({
        id: after.id,
        patch: {
          content_rich: { ...(after.content_rich ?? {}), pageBreakAfter: false },
        },
      });
    }
    const entry: PsaLibraryEntry = {
      id: "image-gap-placeholder",
      kind: "image",
      label: "Imagem",
      default_title: "Imagem",
      default_content_rich: { size, image_id: null, caption: "" },
      default_source_type: "manual",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    };
    addLibraryBlock.mutate(
      { lib: entry, afterOrder: after.sort_order },
      {
        onSuccess: (res) => {
          toast.success(`Imagem ${size} adicionada — escolha uma imagem`);
          onSelect(res.id);
        },
        onError: (e: unknown) => {
          toast.error(e instanceof Error ? e.message : "Erro ao adicionar imagem");
        },
      },
    );
  };


  return (
    <div className="print-area">
      <div
        ref={docRef}
        className={cn("proposal-print-document", previewMode && "proposal-preview-source")}
        style={styleVars}
      >
        {/* PSA running header — fixed in print so it repeats per page.
            Content is editable via the Style panel. */}
        {showHeader && (
          <div className="proposal-page-header">
            <div className="proposal-letterhead-brand">
              <img
                src={psaLogo.url}
                alt={`${headerBrand ?? "Pedra Silva"} ${headerBrandSub ?? "Architects"}`.trim()}
                className="proposal-letterhead-logo"
              />
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
            <div>
              {blocks.map((b, i) => (
                <SortableRow
                  key={b.id}
                  block={b}
                  chapter={chapterByIndex[i]}
                  toc={toc}
                  selected={selectedId === b.id}
                  quoteIdHint={quoteIdHint}
                  lang={lang}
                  onSelect={() => onSelect(b.id)}
                  onPatchContent={(patch) =>
                    update.mutate({
                      id: b.id,
                      patch: {
                        content_rich: { ...(b.content_rich ?? {}), ...patch },
                      },
                    })
                  }
                  siblings={blocks}
                  forceBreakBefore={forcedBreaks.has(b.id)}
                  isFirstPrintable={b.id === firstPrintableId}
                />
              ))}

            </div>
          </SortableContext>
        </DndContext>

        {/* Page-start lines — screen-only markers at every A4 sheet, including
            page 1, using the exact physical height used by the print CSS. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 print:hidden"
        >
          {pageMarkers.map((pb) => (
            <div
              key={pb.page}
              className={cn(
                "absolute left-0 right-0",
                pb.page > 1 && "border-t border-dashed border-sky-300/70",
              )}
              style={{ top: pb.top }}
            >
              <span className="absolute right-2 top-1 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-sky-700">
                Página {pb.page}
              </span>
            </div>
          ))}
        </div>

        {/* Smart-pagination overlays — dashed placeholders sitting inside the
            gap at the bottom of a page. Screen only; the PDF export keeps the
            natural page break in that spot. */}
        <div
          aria-hidden={false}
          className="pointer-events-none absolute inset-0 print:hidden"
          style={{ position: "absolute", inset: 0 }}
        >
          {gaps.map((g, i) => (
            <button
              key={`${g.afterBlockId}-${i}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                insertImagePlaceholder(g.afterBlockId, g.size);
              }}
              className="pointer-events-auto absolute left-[14mm] right-[14mm] flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-amber-400/70 bg-amber-50/40 text-amber-800 transition hover:border-amber-500 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              style={{ top: g.top + 4, height: Math.max(24, g.height - 8) }}
              title={`Sugerido: imagem ${g.size} de página · espaço livre ~${g.gapMm}mm`}
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Espaço livre · {g.gapMm} mm
              </span>
              <span className="text-[10px] opacity-80">
                Sugestão: imagem {g.size} de página — clique para inserir
              </span>
            </button>
          ))}
        </div>




        {/* PSA running footer — editable via the Style panel. */}
        {showFooter && (
          <div className="proposal-page-footer">
            <div className="proposal-page-address">
              {footerAddress.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < footerAddress.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {previewMode && (
        <PaginatedPreview
          source={docRef.current}
          invalidateKey={`${paginationKey}:${docHeight}:${JSON.stringify(styleSettings ?? {})}`}
        />
      )}
    </div>
  );
}
