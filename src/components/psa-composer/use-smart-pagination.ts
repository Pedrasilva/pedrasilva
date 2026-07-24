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
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.height = raw;
  element.appendChild(probe);
  const pixels = probe.getBoundingClientRect().height;
  probe.remove();
  return pixels || fallbackMm * mmToPx;
}

function syncExplicitScreenBreaks(container: HTMLElement, pageH: number, marginTop: number) {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-proposal-block-id]"),
  ).filter((node) => node.offsetParent !== null);

  for (const node of nodes) node.style.removeProperty("--proposal-screen-break-space");

  const containerTop = container.getBoundingClientRect().top;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const next = nodes[index + 1];
    if (!next || !node.classList.contains("proposal-page-break-after")) continue;

    const nextTop = next.getBoundingClientRect().top - containerTop;
    const currentPage = Math.floor(Math.max(0, nextTop - marginTop) / pageH);
    const targetTop = (currentPage + 1) * pageH + marginTop;
    const space = Math.max(0, targetTop - nextTop);
    if (space > 0.5) node.style.setProperty("--proposal-screen-break-space", `${space}px`);
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
      if (rect.width < 100) return;
      const mmToPx = rect.width / PAGE_W_MM;
      const pageH = PAGE_H_MM * mmToPx;
      const marginTop = cssLengthInPx(container, "--psa-margin-top", 34, mmToPx);
      const marginBottom = cssLengthInPx(container, "--psa-margin-bottom", 32, mmToPx);
      const contentBottomOffset = marginBottom;

      // CSS paged-media breaks only take effect in print. Mirror explicit
      // break-after rules with an in-flow screen spacer so editor markers and
      // the exported PDF start subsequent blocks on the same physical page.
      syncExplicitScreenBreaks(container, pageH, marginTop);

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
        const topRel = nRect.top - containerTop;
        const bottomRel = nRect.bottom - containerTop;
        const id = node.dataset.proposalBlockId ?? "";

        // Which page does the block START on?
        // Content on page N spans [marginTop + N*pageH, pageH*(N+1) - marginBottom].
        const startPage = Math.max(
          0,
          Math.floor((topRel - marginTop) / pageH),
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
        const roomLeftPx = pageBottomAbs - topRel;
        const roomLeftMm = roomLeftPx / mmToPx;
        const blockHeightMm = nRect.height / mmToPx;
        if (
          roomLeftMm > 0 &&
          roomLeftMm < FORCE_BREAK_ROOM_MM &&
          blockHeightMm >= FORCE_BREAK_BLOCK_MIN_MM
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
