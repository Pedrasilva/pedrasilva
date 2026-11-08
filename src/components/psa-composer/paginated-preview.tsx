import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { REPAGINATION_DELAY_MS } from "@/lib/psa-proposal/page-layout";
import { installPagedFrame } from "@/lib/psa-proposal/paged-frame";

let paginationQueue: Promise<void> = Promise.resolve();
type PagedListeners = { chunker?: { pages?: Array<{ removeListeners: () => void }> } };

function collectDocumentStyles(source: HTMLDivElement): Array<Record<string, string>> {
  const styles: Array<Record<string, string>> = [];

  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode;
    if (
      owner instanceof HTMLElement &&
      (owner.hasAttribute("data-pagedjs-inserted-styles") ||
        owner.hasAttribute("data-pagedjs-ignore"))
    ) {
      continue;
    }
    try {
      const css = Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
      if (css) styles.push({ [sheet.href ?? window.location.href]: css });
    } catch {
      // Cross-origin stylesheets cannot be read. The proposal's layout CSS is
      // emitted by Vite on the current origin and remains available here.
    }
  }

  // Keep the proposal page contract last so older feature-specific @page
  // rules cannot make Paged.js fall back to its default US Letter sheet.
  const computed = window.getComputedStyle(source);
  const top = computed.getPropertyValue("--psa-margin-top").trim() || "34mm";
  const right = computed.getPropertyValue("--psa-margin-right").trim() || "14mm";
  const bottom = computed.getPropertyValue("--psa-margin-bottom").trim() || "32mm";
  const left = computed.getPropertyValue("--psa-margin-left").trim() || "14mm";
  styles.push({
    "proposal-a4.css": `
      @page proposal-document {
        size: A4;
        margin: ${top} ${right} ${bottom} ${left};
        @top-center { content: ""; width: 100%; }
        @bottom-left { content: ""; }
        @bottom-right { content: counter(page); }

      }
      .proposal-paged-source,
      .proposal-paged-content { page: proposal-document; }
      .proposal-paged-content { display: flow-root; }
      .proposal-paged-content .proposal-print-block { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
      .proposal-paged-content [data-visible-print="false"] { display: none !important; }
      .proposal-paged-content [data-keep-with-next="true"] { break-after: avoid; }
      .proposal-paged-content h1, .proposal-paged-content h2, .proposal-paged-content h3 { break-after: avoid; }
      .proposal-paged-content [data-keep-with-next="false"] h1,
      .proposal-paged-content [data-keep-with-next="false"] h2,
      .proposal-paged-content [data-keep-with-next="false"] h3 { break-after: auto; }
      .proposal-paged-content thead { display: table-header-group; }
      .proposal-paged-content tbody tr { break-inside: avoid; }
      .proposal-paged-source { width: auto !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; }

      .proposal-paged-content p {
        break-inside: auto;
        orphans: 2;
        widows: 2;
      }
      .proposal-paged-content li,
      .proposal-paged-content .proposal-avoid-break,
      .proposal-paged-content .proposal-phase-summary-card {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-paged-content [data-proposal-block-type="index"] {
        break-inside: auto;
        page-break-inside: auto;
      }
      .proposal-paged-content .proposal-page-break-before {
        break-before: page;
      }
      .proposal-paged-content .proposal-page-break-after {
        break-after: page;
      }
      .proposal-paged-content .proposal-print-block[data-first-printable="true"],
      .proposal-paged-content > div > .proposal-print-block:first-child {
        break-before: auto !important;
      }
      .proposal-paged-content .proposal-appendix {
        break-before: auto;
      }
      /* The rotated Gantt sheet must stay atomic: a transformed, absolutely
         positioned subtree cannot be fragmented without corrupting paint. */
      .proposal-paged-content .proposal-print-block-gantt-landscape,
      .proposal-paged-content .proposal-appendix-landscape,
      .proposal-paged-content .proposal-gantt-rotate-outer {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-paged-content .proposal-print-block-gantt-landscape {
        break-before: page;
      }

    `,
  });

  return styles;
}

export function PaginatedPreview({
  source,
  dataReady = true,
  invalidateKey,
  selectedId,
  onSelect,
  onStatusChange,
}: {
  source: HTMLDivElement | null;
  dataReady?: boolean;
  invalidateKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange?: (status: "loading" | "ready" | "error") => void;
}) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const { t } = useTranslation("common");

  useEffect(() => {
    const target = targetRef.current;
    if (!source || !target) return;

    let cancelled = false;
    setStatus("loading");
    onStatusChange?.("loading");
    target.dataset.paginationStatus = "loading";
    if (!dataReady || source.querySelector('[data-live-ready="false"]')) return;

    const render = async () => {
      let frame: HTMLIFrameElement | null = null;
      let releasePages = () => {};
      try {
        await document.fonts?.ready;
        const sourceImages = Array.from(source.querySelectorAll<HTMLImageElement>("img"));
        await Promise.all(
          sourceImages.map(async (image) => {
            if (image.complete) return;
            try {
              await image.decode();
            } catch {
              // A failed decorative image must not prevent document pagination.
            }
          }),
        );
        if (cancelled) return;

        const clone = source.cloneNode(true) as HTMLDivElement;
        clone.removeAttribute("id");
        // Never copy the hidden source state into Paged.js. The clone must be
        // ordinary document flow before the fragmentation engine measures it.
        clone.classList.remove("proposal-pagination-source", "proposal-preview-source");
        clone.querySelectorAll(
          '[data-editor-toolbar="true"], button, .print\\:hidden, [contenteditable="true"] .ProseMirror-menu',
        ).forEach((node) => node.remove());
        clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((node) => {
          node.removeAttribute("contenteditable");
        });
        const firstPrintable = clone.querySelector<HTMLElement>(
          '.proposal-print-block[data-first-printable="true"]',
        );
        if (firstPrintable) {
          firstPrintable.style.setProperty("break-before", "auto", "important");
          firstPrintable.style.setProperty("page-break-before", "auto", "important");
        }
        // Furniture lives in generated margin boxes, outside fragmented block flow.
        const runningElements = Array.from(
          clone.querySelectorAll<HTMLElement>(".proposal-page-header, .proposal-page-footer"),
        );
        runningElements.forEach((element) => element.remove());

        const printRoot = document.createElement("div");
        printRoot.className = "proposal-print-area proposal-print-document proposal-paged-source";
        printRoot.setAttribute("style", source.getAttribute("style") ?? "");
        const content = document.createElement("div");
        content.className = "proposal-paged-content";
        while (clone.firstChild) content.appendChild(clone.firstChild);
        printRoot.appendChild(content);

        frame = document.createElement("iframe");
        frame.title = t("proposalComposer.pagination.pages");
        frame.className = "proposal-pagination-frame";
        target.replaceChildren(frame);
        const frameWindow = installPagedFrame(frame);
        const frameDoc = frame.contentDocument;
        if (!frameDoc || !frameWindow.Paged) throw new Error("Pagination frame unavailable");
        const frameTarget = frameDoc.querySelector<HTMLElement>(".proposal-paginated-preview");
        if (!frameTarget) throw new Error("Pagination target unavailable");
        const styles = collectDocumentStyles(source);
        for (const entry of styles) {
          const style = frameDoc.createElement("style");
          style.textContent = Object.values(entry).join("\n");
          frameDoc.head.appendChild(style);
        }
        await frameDoc.fonts?.ready;
        const previewer = new frameWindow.Paged.Previewer();
        const pagedInternals = previewer as unknown as PagedListeners;
        releasePages = () => pagedInternals.chunker?.pages?.forEach((page) => page.removeListeners());
        // Render away from React's live target. In development/fast toggles an
        // effect cleanup can otherwise remove Paged.js' current page while its
        // async layout is still measuring it, causing the one-page/null crash.
        const staging = frameDoc.createElement("div");
        staging.className = "proposal-pagination-staging";
        frameDoc.body.appendChild(staging);
        const result = await previewer.preview(frameDoc.importNode(printRoot, true), styles, staging);
        if (cancelled) return;
        // Paged.js keeps a ResizeObserver on every generated sheet. Moving the
        // completed sheets out of the staging container otherwise triggers an
        // underflow pass against detached nodes (`findElement(null)`), which
        // can collapse the visible result back to its first page.
        releasePages();
        const pageBoxes = staging.querySelectorAll<HTMLElement>(".pagedjs_pagebox");
        pageBoxes.forEach((pageBox, index) => {
          pageBox.classList.add("proposal-print-document", "proposal-generated-pagebox");
          pageBox.setAttribute("style", source.getAttribute("style") ?? "");
          runningElements.forEach((element) => {
            const selector = element.classList.contains("proposal-page-header")
              ? ".pagedjs_margin-top-center .pagedjs_margin-content"
              : ".pagedjs_margin-bottom-left .pagedjs_margin-content";
            const margin = pageBox.querySelector<HTMLElement>(selector);
            if (margin) {
              margin.classList.add("proposal-margin-furniture");
              margin.appendChild(element.cloneNode(true));
            }
          });
          pageBox.closest<HTMLElement>(".pagedjs_page")?.setAttribute(
            "data-page-number",
            String(index + 1),
          );
        });
        if (result.total !== pageBoxes.length || pageBoxes.length === 0) {
          throw new Error("Pagination produced an incomplete page set");
        }
        // Commit a snapshot instead of moving Paged.js' observed live nodes.
        // Moving those nodes can trigger a late underflow/layout pass which
        // removes every generated sheet after page one.
        const completedPages = staging.querySelector<HTMLElement>(".pagedjs_pages");
        if (!completedPages) {
          throw new Error("Pagination did not produce a page container");
        }
        frameTarget.replaceChildren(completedPages.cloneNode(true));
        staging.remove();
        const reset = frameDoc.createElement("style");
        reset.textContent = "html,body{margin:0!important;padding:0!important;width:210mm!important;overflow:hidden!important} .proposal-paginated-preview{display:block!important} .proposal-paginated-preview .pagedjs_pages{gap:24px!important} .proposal-paginated-preview .pagedjs_page{box-shadow:none!important}";
        frameDoc.head.appendChild(reset);
        frame.style.height = `${frameTarget.scrollHeight}px`;
        frameDoc.addEventListener("click", (event) => {
          const element = event.target as HTMLElement;
          const id = element.closest<HTMLElement>("[data-proposal-block-id]")?.dataset.proposalBlockId;
          if (id) onSelect(id);
        });
        target.dataset.pageCount = String(result.total);
        setStatus("ready");
        onStatusChange?.("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Proposal pagination failed", error);
        // Paged.js may leave one incomplete sheet in the target before it
        // throws. Never present that fragment as if it were the document.
        target.replaceChildren();
        setStatus("error");
        onStatusChange?.("error");
      } finally {
        releasePages();
        if (cancelled) frame?.remove();
      }
    };

    const timer = window.setTimeout(() => { paginationQueue = paginationQueue.then(async () => { if (!cancelled) await render(); }).catch(() => {}); }, REPAGINATION_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, dataReady, invalidateKey, onStatusChange]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const frameDoc = target.querySelector<HTMLIFrameElement>("iframe")?.contentDocument;
    frameDoc?.querySelectorAll<HTMLElement>("[data-proposal-block-id]").forEach((fragment) => {
      fragment.classList.toggle(
        "proposal-paged-block-selected",
        fragment.dataset.proposalBlockId === selectedId,
      );
    });
    if (selectedId) {
      const fragment = Array.from(frameDoc?.querySelectorAll<HTMLElement>("[data-proposal-block-id]") ?? []).find((node) => node.dataset.proposalBlockId === selectedId);
      fragment?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selectedId, status]);

  return (
    <div className="proposal-paginated-stage">
      {status === "loading" && (
        <div className="proposal-pagination-status" role="status">
          {t("proposalComposer.pagination.loading")}
        </div>
      )}
      {status === "error" && (
        <div className="proposal-pagination-status proposal-pagination-status-error" role="alert">
          {t("proposalComposer.pagination.error")}
        </div>
      )}
      <div
        ref={targetRef}
        className="proposal-paginated-preview"
        data-pagination-status={status}
        aria-live="polite"
        onClick={(event) => {
          const element = event.target as HTMLElement;
          const fragment = element.closest<HTMLElement>("[data-proposal-block-id]");
          const id = fragment?.dataset.proposalBlockId;
          if (id) onSelect(id);
        }}
      />
    </div>
  );
}