import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
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
import { resolveBlockTitle } from "@/lib/psa-proposal/system-titles";
import { useMemo } from "react";
import { keepBlockWithNext } from "@/lib/psa-proposal/page-layout";
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
import { BLOCK_UI_KEYS } from "./editor-labels";
import { BlockBody } from "./block-renderer";
import { blockHeadingLevel, computeSectionNumbers, type SectionTocEntry } from "@/lib/psa-proposal/heading-levels";
import { RelevanceBadge } from "./relevance-badge";
import { useLiveQuoteSnapshot, resolveProposalLang, type ProposalLang } from "@/lib/psa-proposal/live-data";
import { useUpdateBlock } from "@/lib/psa-proposal/use-psa-proposal";
import psaLogo from "@/assets/logotipo-psa.jpg.asset.json";
import { resolveMaster, masterVariables, pageVariant } from '@/lib/psa-proposal/master-page';
import { typographyVariables } from '@/lib/psa-proposal/typography';
import { useMasterDefault } from '@/lib/psa-proposal/use-master-page';
import { resolveTextSpacing, textSpacingVariables } from '@/lib/psa-proposal/text-spacing';

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


const NON_NUMBERED: PsaBlockType[] = ["cover", "letter", "index", "acceptance", "page_break"];

function SortableRow({
  block,
  proposalId,
  chapter,
  toc,
  selected,
  quoteIdHint,
  lang,
  onSelect,
  onPatchContent,
  siblings,
  isFirstPrintable,
  readOnly,
}: {
  block: PsaProposalBlock;
  proposalId: string;
  chapter: string | null;
  toc: SectionTocEntry[];
  selected: boolean;
  quoteIdHint: string | null;
  lang: ProposalLang;
  onSelect: () => void;
  onPatchContent: (patch: Record<string, unknown>) => void;
  siblings: PsaProposalBlock[];
  isFirstPrintable: boolean;
  readOnly: boolean;
}) {
  useTranslation();
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
    block.block_type === "letter" ||
    block.block_type === "travel_expenses";
  const liveQuery = useLiveQuoteSnapshot(useLive ? resolvedQuoteId : null, lang, useLive ? proposalId : undefined);
  const live = liveQuery.data;
  const liveReady = !useLive || !resolvedQuoteId || (!!live && !liveQuery.isFetching && !liveQuery.isError);


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
      id={chapter != null ? `chapter-${chapter.replace(/\./g, "-")}` : undefined}
      data-proposal-block-id={block.id}
      data-live-ready={liveReady ? "true" : "false"}
      data-proposal-block-type={block.block_type}
      data-page-type={block.block_type==='cover'?'cover':block.block_type==='letter'?'letter':'content'}
      data-keep-with-next={keepBlockWithNext(block) ? "true" : "false"}
      data-page-aligned={pageAligned ? "true" : undefined}
      data-page-align-y={pageAlignY && pageAlignY !== "none" ? pageAlignY : undefined}
      data-page-align-x={pageAlignX && pageAlignX !== "none" ? pageAlignX : undefined}
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
        (block.block_type === "cover" || block.block_type === "letter") && isPrintable && "proposal-page-break-after",
        isIndexBlock && isPrintable && pageBreakAfter && "proposal-page-break-after",
        !isIndexBlock && pageBreakAfter && isPrintable && "proposal-page-break-after",
      )}
    >

      <div className="absolute -left-6 top-1 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 print:hidden">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-1 text-zinc-400 hover:bg-zinc-100"
          aria-label={uiI18n.t("crm:quoteEditor.reorder")}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      {!readOnly && <div data-editor-only className="mb-2 flex items-center gap-2 text-[10px] text-zinc-500 print:hidden">
        <RelevanceBadge value={block.contract_relevance} />
        <span className="uppercase tracking-widest">{uiI18n.t(BLOCK_UI_KEYS[block.block_type])}</span>
        {!block.is_visible && <EyeOff className="h-3 w-3" />}
        {block.is_locked && <Lock className="h-3 w-3" />}
      </div>}
      {/* Stable anchor for internal PDF links (used by TOC / appendix index). */}
      <span id={`proposal-block-${block.id}`} className="proposal-anchor" aria-hidden="true" />
      <BlockBody
        block={block}
        live={live}
        chapterNumber={chapter}
        toc={toc}
        editable={!readOnly && selected && INLINE_EDITABLE_TYPES.includes(block.block_type) && !block.is_locked}
        onPatchContent={onPatchContent}
        lang={lang}
        siblings={siblings}
      />
    </div>
  );
}


export function ComposerCanvas({
  proposalId,
  blocks: rawBlocks,
  selectedId,
  onSelect,
  onReorder,
  quoteIdHint,
  styleSettings,
  language,
  previewMode = false,
  readOnly = false,
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
  readOnly?: boolean;
}) {
  useTranslation();
  const lang = resolveProposalLang(language);
  const spacingMaster = useMasterDefault();
  // System headings follow the proposal language; user-written ones stay.
  const blocks = useMemo(
    () => rawBlocks.map((b) => ({ ...b, title: resolveBlockTitle(b.block_type, b.title, lang) })),
    [rawBlocks, lang],
  );
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
  const liveForToc = useLiveQuoteSnapshot(firstQuoteRef ?? quoteIdHint, lang, proposalId).data;

  const { chapterByIndex, toc } = useMemo(() => {
    const tocTitle = (b: PsaProposalBlock) => {
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
      return title || b.block_type;
    };
    const { chapters, toc: t } = computeSectionNumbers(blocks, {
      numbered: (b) => !NON_NUMBERED.includes(b.block_type) && b.is_visible,
      level: blockHeadingLevel,
      title: tocTitle,
    });
    return { chapterByIndex: chapters, toc: t };
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

  const master = resolveMaster(styleSettings);
  const firstMaster = pageVariant(master, true);
  const showHeader = master.header.show || !!master.firstPage?.showHeader;
  const showFooter = master.footer.show || !!master.firstPage?.showFooter;
  const headerBrand = styleSettings?.headerBrand ?? "PEDRA SILVA";
  const headerBrandSub = styleSettings?.headerBrandSub ?? "ARCHITECTS";
  const headerEmail = master.contact.email;
  const headerWebsite = master.contact.website;
  const footerAddress = master.footer.address;

  const styleVars: React.CSSProperties = {...masterVariables(firstMaster),...typographyVariables({...master.typography,...styleSettings}),...textSpacingVariables(resolveTextSpacing(spacingMaster.data?.template.textSpacing,styleSettings?.textSpacing,styleSettings?.textSpacingOverride))};

  return (
    <div
      className={cn(
        "proposal-print-area",
        previewMode ? "proposal-canvas-preview" : "proposal-canvas-edit",
      )}
    >
      <div
        className="proposal-print-document proposal-master-document"
        lang={lang}
        data-master-page={JSON.stringify(master)}
        data-page-types-enabled={styleSettings?.pageTypesEnabled ? "true" : undefined}
        style={styleVars}
      >
        {/* PSA running header — fixed in print so it repeats per page.
            Content is editable via the Style panel. */}
        {showHeader && (
          <div className="proposal-page-header" data-first-hidden={!firstMaster.header.show}>
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
                  proposalId={proposalId}
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
                  isFirstPrintable={b.id === firstPrintableId}
                  readOnly={readOnly}
                />
              ))}

            </div>
          </SortableContext>
        </DndContext>

        {/* PSA running footer — editable via the Style panel. */}
        {showFooter && (
          <div className="proposal-page-footer" data-first-hidden={!firstMaster.footer.show}>
            <div className="proposal-page-address">
              {footerAddress.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < footerAddress.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
            <div className="proposal-footer-number" />
            {master.footer.showLogo && <div className="proposal-footer-logo"><img src={psaLogo.url} alt={headerBrand} /></div>}
          </div>
        )}
      </div>
    </div>
  );
}
