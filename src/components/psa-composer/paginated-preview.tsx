import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

function collectDocumentStyles(): Array<Record<string, string>> {
  const styles: Array<Record<string, string>> = [];

  for (const sheet of Array.from(document.styleSheets)) {
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
  styles.push({
    "proposal-a4.css": "@page { size: A4; margin: 0; } .proposal-paged-source { page: auto; }",
  });

  return styles;
}

export function PaginatedPreview({
  source,
  invalidateKey,
  selectedId,
  onSelect,
}: {
  source: HTMLDivElement | null;
  invalidateKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
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

    const render = async () => {
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
        printRoot.className = "proposal-print-area proposal-paged-source";
        printRoot.appendChild(clone);

        const { Previewer } = await import("pagedjs");
        if (cancelled) return;
        const previewer = new Previewer();
        await previewer.preview(printRoot, collectDocumentStyles(), target);
        if (cancelled) return;
        target.querySelectorAll<HTMLElement>(".pagedjs_pagebox").forEach((pageBox) => {
          runningElements.forEach((element) => pageBox.appendChild(element.cloneNode(true)));
        });
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Proposal pagination failed", error);
        setStatus("error");
      }
    };

    void render();
    return () => {
      cancelled = true;
      target.replaceChildren();
    };
  }, [source, invalidateKey]);

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