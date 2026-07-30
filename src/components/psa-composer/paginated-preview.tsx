import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
      }
      .proposal-paged-source,
      .proposal-paged-content { page: proposal-document; }
      .proposal-paged-content { display: flow-root; }
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
  invalidateKey,
  selectedId,
  onSelect,
  onStatusChange,
}: {
  source: HTMLDivElement | null;
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
    target.replaceChildren();
    setStatus("loading");
    onStatusChange?.("loading");

    const render = async () => {
      let staging: HTMLDivElement | null = null;
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
        // Paged.js currently creates a blank page for running/fixed elements.
        // Remove page furniture from the fragmented flow and add a visual copy
        // to each generated page box after pagination instead.
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

        const { Previewer } = await import("pagedjs");
        if (cancelled) return;
        const previewer = new Previewer();
        // Render away from React's live target. In development/fast toggles an
        // effect cleanup can otherwise remove Paged.js' current page while its
        // async layout is still measuring it, causing the one-page/null crash.
        staging = document.createElement("div");
        staging.className = "proposal-pagination-staging";
        document.body.appendChild(staging);
        const result = await previewer.preview(printRoot, collectDocumentStyles(source), staging);
        if (cancelled) return;
        // Paged.js keeps a ResizeObserver on every generated sheet. Moving the
        // completed sheets out of the staging container otherwise triggers an
        // underflow pass against detached nodes (`findElement(null)`), which
        // can collapse the visible result back to its first page.
        const pagedInternals = previewer as unknown as {
          chunker?: { pages?: Array<{ removeListeners: () => void }> };
        };
        pagedInternals.chunker?.pages?.forEach((page) => page.removeListeners());
        const pageBoxes = staging.querySelectorAll<HTMLElement>(".pagedjs_pagebox");
        pageBoxes.forEach((pageBox, index) => {
          pageBox.classList.add("proposal-print-document", "proposal-generated-pagebox");
          pageBox.setAttribute("style", source.getAttribute("style") ?? "");
          runningElements.forEach((element) => pageBox.appendChild(element.cloneNode(true)));
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
        target.replaceChildren(completedPages.cloneNode(true));
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
        staging?.remove();
      }
    };

    void render();
    return () => {
      cancelled = true;
      target.replaceChildren();
    };
  }, [source, invalidateKey, onStatusChange]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    target.querySelectorAll<HTMLElement>("[data-proposal-block-id]").forEach((fragment) => {
      fragment.classList.toggle(
        "proposal-paged-block-selected",
        fragment.dataset.proposalBlockId === selectedId,
      );
    });
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