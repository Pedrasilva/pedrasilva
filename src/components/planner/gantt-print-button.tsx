/**
 * GanttPrintButton — Merlin-style print dialog for the Gantt chart.
 *
 * Renders a "PDF" trigger button. The dialog lets the user pick:
 *   - Paper size: A4 or A3 (always landscape)
 *   - Scale: "Fit to page" (auto) or manual percentage
 *
 * Printing strategy: when the user confirms, we expand the target scroll
 * container to its full scrollWidth/scrollHeight, inject a @page rule with
 * the chosen size + landscape orientation, optionally apply a CSS
 * `transform: scale(N)` so the full Gantt fits the printable area, then
 * call `window.print()`. The browser's native print dialog handles the
 * "Save as PDF" step. Cleanup runs in an `afterprint` listener.
 */
import { useRef, useState } from "react";
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

// Printable area in millimetres, landscape, with ~10mm margins on each side.
const PAGE_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 297 - 20, h: 210 - 20 },
  A3: { w: 420 - 20, h: 297 - 20 },
};
const MM_TO_PX = 96 / 25.4;

export function GanttPrintButton({ getTarget }: { getTarget: () => HTMLElement | null }) {
  const [open, setOpen] = useState(false);
  const [paper, setPaper] = useState<PaperSize>("A4");
  const [fit, setFit] = useState(true);
  const [scale, setScale] = useState(100);
  const cleanupRef = useRef<(() => void) | null>(null);

  const handlePrint = () => {
    const target = getTarget();
    if (!target) return;

    const inner = target.firstElementChild as HTMLElement | null;
    if (!inner) return;

    const page = PAGE_MM[paper];
    const pagePxW = page.w * MM_TO_PX;
    const pagePxH = page.h * MM_TO_PX;

    const contentW = Math.max(target.scrollWidth, inner.scrollWidth);
    const contentH = Math.max(target.scrollHeight, inner.scrollHeight);

    let effectiveScale = scale / 100;
    if (fit) {
      effectiveScale = Math.min(pagePxW / contentW, pagePxH / contentH, 1);
    }

    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-gantt-print", "true");
    styleEl.textContent = `
      @page { size: ${paper} landscape; margin: 10mm; }
      @media print {
        html, body { background: white !important; }
        body * { visibility: hidden !important; }
        [data-gantt-print-root], [data-gantt-print-root] * { visibility: visible !important; }
        [data-gantt-print-root] {
          position: fixed !important;
          inset: 0 !important;
          width: ${contentW}px !important;
          height: ${contentH}px !important;
          max-height: none !important;
          overflow: visible !important;
          transform: scale(${effectiveScale}) !important;
          transform-origin: top left !important;
          background: white !important;
        }
        [data-gantt-print-root] > * {
          overflow: visible !important;
          max-height: none !important;
          height: auto !important;
        }
      }
    `;

    // Mark the print root.
    target.setAttribute("data-gantt-print-root", "true");
    document.head.appendChild(styleEl);

    const cleanup = () => {
      styleEl.remove();
      target.removeAttribute("data-gantt-print-root");
      window.removeEventListener("afterprint", cleanup);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener("afterprint", cleanup);

    setOpen(false);
    // Give the dialog a tick to close before invoking print.
    setTimeout(() => window.print(), 100);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print Gantt chart</DialogTitle>
          <DialogDescription>
            Choose paper size and fit. Use your browser's print dialog to save as PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Paper size (landscape)</Label>
            <RadioGroup
              value={paper}
              onValueChange={(v) => setPaper(v as PaperSize)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="paper-a4" value="A4" />
                <Label htmlFor="paper-a4" className="text-sm">A4 (297 × 210 mm)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="paper-a3" value="A3" />
                <Label htmlFor="paper-a3" className="text-sm">A3 (420 × 297 mm)</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="fit-toggle" className="text-sm font-medium">
                Fit to page
              </Label>
              <Switch id="fit-toggle" checked={fit} onCheckedChange={setFit} />
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-scales the chart so the full timeline fits on one page.
            </p>
          </div>

          {!fit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Scale</Label>
                <span className="text-sm tabular-nums text-muted-foreground">{scale}%</span>
              </div>
              <Slider
                min={25}
                max={100}
                step={5}
                value={[scale]}
                onValueChange={(v) => setScale(v[0] ?? 100)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
