/**
 * Canvas-based PDF preview.
 *
 * Chrome blocks the native PDF plugin inside nested/sandboxed preview iframes
 * ("This page has been blocked by Chrome"), even for same-origin blob URLs.
 * Rendering the first pages with pdf.js into a <canvas> avoids the plugin
 * entirely, so the document is always visible in the review queue.
 */
import { useEffect, useRef, useState } from "react";

const MAX_PAGES = 3;

export function PdfCanvasPreview({
  url,
  className,
  fallbackLabel,
}: {
  url: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setReady(false);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const width = container.clientWidth || 480;
        const count = Math.min(doc.numPages, MAX_PAGES);
        for (let i = 1; i <= count; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * (window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.display = "block";
          canvas.style.marginBottom = "8px";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          container.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex h-[320px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {fallbackLabel ?? error}
      </div>
    );
  }

  return (
    <div className={className}>
      {!ready && (
        <div className="flex h-[80px] items-center justify-center text-xs text-muted-foreground">
          …
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
