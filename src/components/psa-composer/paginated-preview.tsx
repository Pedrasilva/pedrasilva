import { useEffect, useRef } from "react";

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

  return styles;
}

export function PaginatedPreview({
  source,
  invalidateKey,
}: {
  source: HTMLDivElement | null;
  invalidateKey: string;
}) {
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!source || !target) return;

    let cancelled = false;
    target.replaceChildren();

    const render = async () => {
      await document.fonts?.ready;
      if (cancelled) return;

      const clone = source.cloneNode(true) as HTMLDivElement;
      clone.removeAttribute("id");
      // The live editor source is moved off-screen while preview mode is open.
      // Never copy that state into Paged.js: it would paginate an off-canvas,
      // fixed-position document and create header-only sheets before content.
      clone.classList.remove("proposal-preview-source");
      clone.querySelectorAll(
        '[data-editor-toolbar="true"], button, .print\\:hidden, [contenteditable="true"] .ProseMirror-menu',
      ).forEach((node) => node.remove());
      clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((node) => {
        node.removeAttribute("contenteditable");
      });
      clone.querySelectorAll<HTMLElement>("[style*='--proposal-screen-break-space']").forEach((node) => {
        node.style.removeProperty("--proposal-screen-break-space");
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
      printRoot.className = "print-area proposal-paged-source";
      printRoot.appendChild(clone);

      const { Previewer } = await import("pagedjs");
      if (cancelled) return;
      const previewer = new Previewer();
      await previewer.preview(printRoot, collectDocumentStyles(), target);
      if (cancelled) return;
      target.querySelectorAll<HTMLElement>(".pagedjs_pagebox").forEach((pageBox) => {
        runningElements.forEach((element) => pageBox.appendChild(element.cloneNode(true)));
      });
    };

    void render();
    return () => {
      cancelled = true;
      target.replaceChildren();
    };
  }, [source, invalidateKey]);

  return <div ref={targetRef} className="proposal-paginated-preview" aria-live="polite" />;
}