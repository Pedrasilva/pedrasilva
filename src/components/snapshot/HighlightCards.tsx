import { Card, CardContent } from "@/components/ui/card";
import type { Computed } from "@/lib/salary";
import { fmtEUR } from "@/lib/salary";

type Tone = "sage" | "clay" | "ink";

function toneClasses(tone: Tone) {
  if (tone === "sage")
    return "border-[var(--sage)]/40 bg-[color-mix(in_oklab,var(--sage)_8%,transparent)]";
  if (tone === "clay")
    return "border-[var(--clay)]/40 bg-[color-mix(in_oklab,var(--clay)_8%,transparent)]";
  return "border-border bg-muted/30";
}

export function HighlightCard({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;