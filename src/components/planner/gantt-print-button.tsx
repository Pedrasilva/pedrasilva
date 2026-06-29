/**
 * GanttPrintButton — Merlin-style print dialog with live preview.
 *
 * Lets the user pick:
 *   - Paper size: A4 or A3 (always landscape)
 *   - Pages across: 1–6. When > 1 the Gantt is tiled horizontally so each
 *     slice fills one printable page.
 *   - Fit-to-page (height): auto-scales so each tile fits the printable
 *     area; otherwise the user picks a manual scale.
 *
 * Preview: the right pane renders the same tile layout the printer will
 * receive, shrunk to fit. Confirming triggers the browser's native print
 * dialog (Save as PDF supported).
 */
import { useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

type PaperSize = "A4" | "A3";
type Orientation = "landscape" | "portrait";

// Paper dimensions (mm) in portrait orientation.
const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};
const MARGIN_MM = 10;
const MM_TO_PX = 96 / 25.4;

function pagePrintableMm(paper: PaperSize, orientation: Orientation) {
  const { w, h } = PAPER_MM[paper];
  const portrait = { w: w - MARGIN_MM * 2, h: h - MARGIN_MM * 2 };
  return orientation === "portrait" ? portrait : { w: portrait.h, h: portrait.w };
}

interface Layout {
  pagePxW: number;
  pagePxH: number;
  contentW: number;
  contentH: number;
  scale: number;
  pages: number;
  tileSrcW: number; // source pixels per tile (pagePxW / scale)
}

function computeLayout(opts: {
  paper: PaperSize;
  orientation: Orientation;
  pages: number;
  fit: boolean;
  manualScale: number;
  contentW: number;
  contentH: number;
}): Layout {
  const page = pagePrintableMm(opts.paper, opts.orientation);
  const pagePxW = page.w * MM_TO_PX;
  const pagePxH = page.h * MM_TO_PX;
  let scale: number;
  if (opts.fit) {
    scale = Math.min(
      (pagePxW * opts.pages) / opts.contentW,
      pagePxH / opts.contentH,
      1,
    );
  } else {
    scale = opts.manualScale / 100;
  }
  return {
    pagePxW,
    pagePxH,
    contentW: opts.contentW,
    contentH: opts.contentH,
    scale,
    pages: opts.pages,
    tileSrcW: pagePxW / scale,
  };
}

export function GanttPrintButton({ getTarget }: { getTarget: () => HTMLElement | null }) {
  const [open, setOpen] = useState(false);
  const [paper, setPaper] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [pages, setPages] = useState(1);
  const [fit, setFit] = useState(true);
  const [manualScale, setManualScale] = useState(100);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Capture content size when dialog opens, so the preview & layout
  // computations stay stable while the user tweaks options.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onOpenChange = (next: boolean) => {
    if (next) {
      const target = getTarget();
      if (target) {
        const inner = target.firstElementChild as HTMLElement | null;
        const w = Math.max(target.scrollWidth, inner?.scrollWidth ?? 0);
        const h = Math.max(target.scrollHeight, inner?.scrollHeight ?? 0);
        setSize({ w, h });
      }
    }
    setOpen(next);
  };

  const layout = useMemo(() => {
    if (!size) return null;
    return computeLayout({
      paper,
      orientation,
      pages,
      fit,
      manualScale,
      contentW: size.w,
      contentH: size.h,
    });
  }, [paper, orientation, pages, fit, manualScale, size]);

  // Build a tiled clone of the Gantt and inject into the document, then
  // call window.print(). Each tile is one printable page.
  const handlePrint = () => {
    const target = getTarget();
    if (!target || !layout) return;

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-gantt-print-root", "true");
    wrapper.style.position = "fixed";
    wrapper.style.inset = "0";
    wrapper.style.zIndex = "999999";
    wrapper.style.background = "white";
    wrapper.style.overflow = "hidden";

    for (let i = 0; i < layout.pages; i++) {
      const tile = document.createElement("div");
      tile.className = "gantt-print-tile";
      tile.style.width = `${layout.pagePxW}px`;
      tile.style.height = `${layout.pagePxH}px`;
      tile.style.overflow = "hidden";
      tile.style.position = "relative";
      tile.style.background = "white";
      tile.style.pageBreakAfter = "always";
      (tile.style as CSSStyleDeclaration).breakAfter = "page";

      const clone = target.cloneNode(true) as HTMLElement;
      clone.style.width = `${layout.contentW}px`;
      clone.style.height = `${layout.contentH}px`;
      clone.style.maxHeight = "none";
      clone.style.overflow = "visible";
      clone.style.transform = `translateX(${-i * layout.tileSrcW}px) scale(${layout.scale})`;
      clone.style.transformOrigin = "top left";
      clone.style.position = "absolute";
      clone.style.top = "0";
      clone.style.left = "0";
      tile.appendChild(clone);
      wrapper.appendChild(tile);
    }

    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-gantt-print", "true");
    styleEl.textContent = `
      @page { size: ${paper} ${orientation}; margin: 10mm; }
      @media print {
        html, body { background: white !important; }
        body > *:not([data-gantt-print-root]) { display: none !important; }
        [data-gantt-print-root] { position: static !important; }
        [data-gantt-print-root] .gantt-print-tile { page-break-after: always; break-after: page; }
        [data-gantt-print-root] .gantt-print-tile:last-child { page-break-after: auto; break-after: auto; }
      }
      @media screen {
        [data-gantt-print-root] { display: none; }
      }
    `;

    document.head.appendChild(styleEl);
    document.body.appendChild(wrapper);

    const cleanup = () => {
      styleEl.remove();
      wrapper.remove();
      window.removeEventListener("afterprint", cleanup);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener("afterprint", cleanup);

    setOpen(false);
    setTimeout(() => window.print(), 120);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          title="Print / Save as PDF"
        >
          <Printer className="h-3.5 w-3.5 mr-1" />
          PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Print Gantt chart</DialogTitle>
          <DialogDescription>
            Choose paper size, spread across pages if needed, then preview.
            Use your browser's print dialog to save as PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 py-2">
          {/* Controls */}
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Paper size (landscape)</Label>
              <RadioGroup
                value={paper}
                onValueChange={(v) => setPaper(v as PaperSize)}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="paper-a4" value="A4" />
                  <Label htmlFor="paper-a4" className="text-sm">A4</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="paper-a3" value="A3" />
                  <Label htmlFor="paper-a3" className="text-sm">A3</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Spread across pages</Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {pages} {pages === 1 ? "page" : "pages"}
                </span>
              </div>
              <Slider
                min={1}
                max={6}
                step={1}
                value={[pages]}
                onValueChange={(v) => setPages(v[0] ?? 1)}
              />
              <p className="text-xs text-muted-foreground">
                Tile the timeline horizontally across multiple pages for legibility.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="fit-toggle" className="text-sm font-medium">
                  Fit height to page
                </Label>
                <Switch id="fit-toggle" checked={fit} onCheckedChange={setFit} />
              </div>
            </div>

            {!fit && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Scale</Label>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {manualScale}%
                  </span>
                </div>
                <Slider
                  min={25}
                  max={100}
                  step={5}
                  value={[manualScale]}
                  onValueChange={(v) => setManualScale(v[0] ?? 100)}
                />
              </div>
            )}

            {layout && (
              <div className="text-xs text-muted-foreground border-t pt-3 space-y-0.5">
                <div>Effective scale: {(layout.scale * 100).toFixed(0)}%</div>
                <div>
                  Page size: {Math.round(layout.pagePxW)} × {Math.round(layout.pagePxH)} px
                </div>
                <div>
                  Content: {Math.round(layout.contentW)} × {Math.round(layout.contentH)} px
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <PrintPreview getTarget={getTarget} layout={layout} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={!layout}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * PrintPreview — renders the same tile layout the printer will produce,
 * shrunk to fit the available width. Each tile mirrors one printed page.
 */
function PrintPreview({
  getTarget,
  layout,
}: {
  getTarget: () => HTMLElement | null;
  layout: Layout | null;
}) {
  // We render each tile as a fixed-size box with overflow hidden, then
  // wrap its inner clone container with a transform that mirrors the
  // print transform. The whole row is shrunk to fit the preview pane.
  const PREVIEW_MAX_W = 720;
  const PREVIEW_MAX_H = 460;
  const GAP = 12;
  const { previewScale, scaledW, scaledH, unscaledW } = useMemo(() => {
    if (!layout) {
      return { previewScale: 1, scaledW: 0, scaledH: 0, unscaledW: 0 };
    }
    const totalW = layout.pagePxW * layout.pages + (layout.pages - 1) * GAP;
    const s = Math.min(PREVIEW_MAX_W / totalW, PREVIEW_MAX_H / layout.pagePxH, 1);
    return {
      previewScale: s,
      scaledW: totalW * s,
      scaledH: layout.pagePxH * s,
      unscaledW: totalW,
    };
  }, [layout]);

  if (!layout) {
    return (
      <div className="border rounded-md bg-muted/30 h-72 flex items-center justify-center text-sm text-muted-foreground">
        Loading preview…
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-muted/20 p-3">
      {/* Outer box claims the *scaled* size so the surrounding layout
          doesn't reserve full unscaled height (root cause of the tall
          preview). Inner div is the unscaled row, shrunk via transform. */}
      <div
        style={{ width: scaledW, height: scaledH, overflow: "hidden" }}
        className="relative mx-auto"
      >
        <div
          style={{
            transform: `scale(${previewScale})`,
            transformOrigin: "top left",
            width: unscaledW,
            height: layout.pagePxH,
            gap: GAP,
          }}
          className="flex"
        >
          {Array.from({ length: layout.pages }).map((_, i) => (
            <PreviewTile key={i} index={i} layout={layout} getTarget={getTarget} />
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-2 text-center">
        Preview at {(previewScale * 100).toFixed(0)}% — each tile prints on one {/* */}
        landscape sheet.
      </div>
    </div>
  );
}

function PreviewTile({
  index,
  layout,
  getTarget,
}: {
  index: number;
  layout: Layout;
  getTarget: () => HTMLElement | null;
}) {
  // Use a ref callback to inject a fresh clone of the live Gantt into the
  // tile. We rebuild on every render so the preview reflects current data.
  const setRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    const target = getTarget();
    if (!target) return;
    node.innerHTML = "";
    const clone = target.cloneNode(true) as HTMLElement;
    clone.style.width = `${layout.contentW}px`;
    clone.style.height = `${layout.contentH}px`;
    clone.style.maxHeight = "none";
    clone.style.overflow = "visible";
    clone.style.transform = `translateX(${-index * layout.tileSrcW}px) scale(${layout.scale})`;
    clone.style.transformOrigin = "top left";
    clone.style.position = "absolute";
    clone.style.top = "0";
    clone.style.left = "0";
    clone.style.pointerEvents = "none";
    node.appendChild(clone);
  };

  return (
    <div
      ref={setRef}
      className="relative bg-white shadow border"
      style={{
        width: layout.pagePxW,
        height: layout.pagePxH,
        overflow: "hidden",
        flex: "0 0 auto",
      }}
    />
  );
}
