/**
 * Smart pagination for the Proposal Composer.
 *
 * Measures each rendered block against the A4 page geometry of the
 * `.proposal-print-document` sheet in the preview and surfaces two things:
 *
 *   1. Awkward gaps at the bottom of a page — when the next block spills
 *      onto a new page and leaves more than ~25mm of empty room behind,
 *      the hook returns a placeholder suggestion sized to the closest
 *      "library image" bucket (1/4, 1/3, 1/2, 2/3 page).
 *   2. Blocks that would be cut inconveniently — a block that starts in
 *      the last few centimetres of a page and is tall enough to break
 *      badly gets a "force page-break-before" hint that the canvas maps
 *      to a data attribute + CSS rule.
 *
 * The hook is purely observational: it never mutates block content. All
 * DOM measurement happens against `data-proposal-block-id` nodes inside
 * the passed container ref, using the shared A4 width (210mm) to derive
 * a mm-to-px scale.
 */

import { useEffect, useState } from "react";
import type { RefObject } from "react";

export type ImageSizeBucket = "1/4" | "1/3" | "1/2" | "2/3";

export interface GapSuggestion {
  /** Block after which the placeholder should sit visually. */
  afterBlockId: string;
  /** Offset in px from the container top where the placeholder starts. */
  top: number;
  /** Height in px available for the placeholder. */
  height: number;
  /** Gap size in mm, rounded. */
  gapMm: number;
  /** Recommended image size bucket. */
  size: ImageSizeBucket;
}

export interface SmartPaginationResult {
  gaps: GapSuggestion[];
  /** IDs of blocks that should force a page break before themselves. */
  forcedBreaks: Set<string>;
  /** mm to px scale factor at current preview zoom. */
  mmToPx: number;
}

const PAGE_H_MM = 297;
const PAGE_W_MM = 210;
/** Minimum empty band at the end of a page to warrant a placeholder. */
const MIN_GAP_MM = 25;
/** Minimum room a block needs at start-of-page before we suggest a break. */
const FORCE_BREAK_ROOM_MM = 40;
/** Below this block height we don't bother forcing a break. */
const FORCE_BREAK_BLOCK_MIN_MM = 60;

const BUCKET_MM: Record<ImageSizeBucket, number> = {
  "1/4": 60,
  "1/3": 85,
  "1/2": 130,
  "2/3": 175,
};

function bucketForGap(gapMm: number): ImageSizeBucket {
  // Pick the largest bucket that still fits comfortably (with a 5mm buffer).
  const usable = gapMm - 5;
  if (usable >= BUCKET_MM["2/3"]) return "2/3";
  if (usable >= BUCKET_MM["1/2"]) return "1/2";
  if (usable >= BUCKET_MM["1/3"]) return "1/3";
  return "1/4";
}

function cssLengthInPx(element: HTMLElement, property: string, fallbackMm: number, mmToPx: number) {
  const raw = getComputedStyle(element).getPropertyValue(property).trim();
  if (!raw) return fallbackMm * mmToPx;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallbackMm * mmToPx;
  if (raw.endsWith("mm")) return value * mmToPx;
  if (raw.endsWith("cm")) return value * 10 * mmToPx;
  if (raw.endsWith("in")) return value * 25.4 * mmToPx;
  if (raw.endsWith("pt")) return value * (25.4 / 72) * mmToPx;
  return value;
}

function syncExplicitScreenBreaks(
  container: HTMLElement,
  pageH: number,
  marginTop: number,
  previewScale: number,
) {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-proposal-block-id]"),
  ).filter((node) => node.offsetParent !== null);

  for (const node of nodes) {
    node.style.removeProperty("--proposal-screen-break-space");
    node.style.removeProperty("--proposal-screen-break-before-space");
  }

  const containerTop = container.getBoundingClientRect().top;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const next = nodes[index + 1];
    if (node.classList.contains("proposal-page-break-before")) {
      const naturalTop = (node.getBoundingClientRect().top - containerTop) / previewScale;
      const targetPage = Math.max(1, Math.ceil(naturalTop / pageH));
      const targetTop = targetPage * pageH + marginTop;
      const space = Math.max(0, targetTop - naturalTop);
      if (space > 0.5) {
        node.style.setProperty("--proposal-screen-break-before-space", `${space}px`);
      }
    }
    if (!next || !node.classList.contains("proposal-page-break-after")) continue;

    const nextTop = (next.getBoundingClientRect().top - containerTop) / previewScale;
    /* Snap the following block to the earliest page content start at or after
       its natural position. Using floor + 1 always skipped an extra page when
       a full-page block (such as the cover) had already placed the next block
       at the following boundary. */
    const targetPage = Math.max(
      1,
      Math.ceil(Math.max(0, nextTop - marginTop) / pageH),
    );
    const targetTop = targetPage * pageH + marginTop;
    const space = Math.max(0, targetTop - nextTop);
    if (space > 0.5) node.style.setProperty("--proposal-screen-break-space", `${space}px`);
  }
}

function syncSmartScreenBreaks(
  container: HTMLElement,
  pageH: number,
  marginTop: number,
  previewScale: number,
) {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-proposal-block-id]"),
  ).filter((node) => node.offsetParent !== null);

  for (const node of nodes) node.style.removeProperty("--proposal-smart-break-space");

  const containerTop = container.getBoundingClientRect().top;
  for (const node of nodes) {
    if (!node.classList.contains("proposal-smart-break-screen")) continue;
    const currentSpace = Number.parseFloat(
      node.style.getPropertyValue("--proposal-smart-break-space"),
    ) || 0;
    const naturalTop =
      (node.getBoundingClientRect().top - containerTop) / previewScale - currentSpace;
    const targetPage = Math.max(1, Math.ceil((naturalTop - marginTop) / pageH));
    const targetTop = targetPage * pageH + marginTop;
    const space = Math.max(0, targetTop - naturalTop);
    if (space > 0.5) {
      node.style.setProperty("--proposal-smart-break-space", `${space}px`);
    }
  }
}

export function useSmartPagination(
  containerRef: RefObject<HTMLElement | null>,
  /** Bumped by the caller when block list identity changes. */
  invalidateKey: unknown,
): SmartPaginationResult {
  const [result, setResult] = useState<SmartPaginationResult>({
    gaps: [],
    forcedBreaks: new Set(),
    mmToPx: 1,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let raf = 0;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 100 || container.offsetWidth < 100) return;
      /* The composer shell scales the A4 sheet to fit the viewport. Layout
         values (absolute marker tops, margins and spacer CSS) remain in
         unscaled CSS pixels, while getBoundingClientRect() is scaled. Keep
         all pagination arithmetic in layout pixels to avoid feedback loops
         and page markers drifting away from print. */
      const previewScale = rect.width / container.offsetWidth;
      const mmToPx = container.offsetWidth / PAGE_W_MM;
      const pageH = PAGE_H_MM * mmToPx;
      const marginTop = cssLengthInPx(container, "--psa-margin-top", 34, mmToPx);
      const marginBottom = cssLengthInPx(container, "--psa-margin-bottom", 32, mmToPx);
      const contentBottomOffset = marginBottom;

      // CSS paged-media breaks only take effect in print. Mirror explicit
      // break-after rules with an in-flow screen spacer so editor markers and
      // the exported PDF start subsequent blocks on the same physical page.
      syncExplicitScreenBreaks(container, pageH, marginTop, previewScale);
      // A smart break is a screen-only prediction of the browser moving a
      // heading/section to the next printed page. The class alone does not
      // create screen pagination, so add the exact outside spacing required
      // to start that block at the next page's content area.
      syncSmartScreenBreaks(container, pageH, marginTop, previewScale);

      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-proposal-block-id]"),
      );
      if (nodes.length === 0) {
        setResult({ gaps: [], forcedBreaks: new Set(), mmToPx });
        return;
      }

      const gaps: GapSuggestion[] = [];
      const forcedBreaks = new Set<string>();
      const containerTop = rect.top;

      let prevBottom: number | null = null;
      let prevBlockId: string | null = null;
      let prevPageIndex = 0;

      for (const node of nodes) {
        // Hidden / print-only blocks don't affect on-screen pagination.
        if (node.offsetParent === null) continue;

        const nRect = node.getBoundingClientRect();
        const topRel = (nRect.top - containerTop) / previewScale;
        const bottomRel = (nRect.bottom - containerTop) / previewScale;
        const smartSpace = Number.parseFloat(
          node.style.getPropertyValue("--proposal-smart-break-space"),
        ) || 0;
        const naturalTopRel = topRel - smartSpace;
        const naturalBottomRel = bottomRel - smartSpace;
        const id = node.dataset.proposalBlockId ?? "";

        // Which page does the block START on?
        // Content on page N spans [marginTop + N*pageH, pageH*(N+1) - marginBottom].
        const startPage = Math.max(
          0,
          Math.floor((naturalTopRel - marginTop) / pageH),
        );
        const pageBottomAbs = (startPage + 1) * pageH - contentBottomOffset;

        if (prevBottom != null && startPage > prevPageIndex && prevBlockId) {
          // The block spilled to a later page. The gap sits at the bottom of
          // the previous page.
          const prevPageBottom =
            (prevPageIndex + 1) * pageH - contentBottomOffset;
          const gapPx = prevPageBottom - prevBottom;
          const gapMm = Math.round(gapPx / mmToPx);
          if (gapMm >= MIN_GAP_MM) {
            gaps.push({
              afterBlockId: prevBlockId,
              top: prevBottom,
              height: gapPx,
              gapMm,
              size: bucketForGap(gapMm),
            });
          }
        }

        // If the block starts near the bottom of its page and is tall enough
        // to break badly, suggest a forced break before it. We can't actually
        // move it here; we return a hint the canvas maps to CSS.
        const roomLeftPx = pageBottomAbs - naturalTopRel;
        const roomLeftMm = roomLeftPx / mmToPx;
        const blockHeightMm = nRect.height / previewScale / mmToPx;
        const endPage = Math.max(
          startPage,
          Math.floor((naturalBottomRel - marginTop) / pageH),
        );
        const computedBreakInside = getComputedStyle(node).breakInside;
        const avoidsBreak =
          computedBreakInside === "avoid" ||
          node.matches(
            ".proposal-avoid-break, .proposal-print-block-gantt-landscape, [data-page-aligned='true']",
          );
        // Print keeps a heading with the content immediately after it. When a
        // proposal block begins late enough that this opening unit crosses the
        // page edge, Chromium moves the heading (and therefore the block's
        // visible start) to the next page. Mirror that specific fragmentation
        // rule instead of leaving the editor divider between title and body.
        const firstHeading = node.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
        const headingRect = firstHeading?.getBoundingClientRect();
        const headingTopRel = headingRect
          ? (headingRect.top - containerTop) / previewScale - smartSpace
          : null;
        const headingPhysicalPage = headingTopRel == null
          ? Math.max(0, Math.floor(naturalTopRel / pageH))
          : Math.max(0, Math.floor(headingTopRel / pageH));
        const headingPhysicalPageBottom = (headingPhysicalPage + 1) * pageH;
        const headingRoomToDividerMm = headingTopRel == null
          ? Number.POSITIVE_INFINITY
          : (headingPhysicalPageBottom - headingTopRel) / mmToPx;
        const openingUnitNeedsNextPage =
          naturalBottomRel > headingPhysicalPageBottom &&
          headingRoomToDividerMm > 0 &&
          headingRoomToDividerMm < 65;
        if (
          (avoidsBreak && endPage > startPage) ||
          openingUnitNeedsNextPage ||
          (roomLeftMm > 0 &&
            roomLeftMm < FORCE_BREAK_ROOM_MM &&
            blockHeightMm >= FORCE_BREAK_BLOCK_MIN_MM)
        ) {
          forcedBreaks.add(id);
        }

        prevBottom = bottomRel;
        prevBlockId = id;
        prevPageIndex = Math.max(
          startPage,
          Math.floor((bottomRel - marginTop) / pageH),
        );
      }

      setResult((prev) => {
        // Skip state churn if nothing changed — avoids ResizeObserver loops.
        const same =
          prev.gaps.length === gaps.length &&
          prev.forcedBreaks.size === forcedBreaks.size &&
          Math.abs(prev.mmToPx - mmToPx) < 0.01 &&
          gaps.every(
            (g, i) =>
              prev.gaps[i]?.afterBlockId === g.afterBlockId &&
              prev.gaps[i]?.size === g.size &&
              Math.abs((prev.gaps[i]?.top ?? 0) - g.top) < 1,
          ) &&
          [...forcedBreaks].every((id) => prev.forcedBreaks.has(id));
        if (same) return prev;
        return { gaps, forcedBreaks, mmToPx };
      });
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    // Observe children too so that image loads / rich-text edits re-measure.
    container
      .querySelectorAll<HTMLElement>("[data-proposal-block-id]")
      .forEach((n) => ro.observe(n));

    const mo = new MutationObserver(schedule);
    mo.observe(container, { childList: true, subtree: true, characterData: true });

    window.addEventListener("resize", schedule);
    // Re-measure when fonts finish loading (block heights shift).
    if (document.fonts && "ready" in document.fonts) {
      document.fonts.ready.then(schedule).catch(() => {});
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, invalidateKey]);

  return result;
}

export const SMART_PAGINATION_BUCKETS = BUCKET_MM;
