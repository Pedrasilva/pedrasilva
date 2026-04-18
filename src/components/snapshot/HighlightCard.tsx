import { Card, CardContent } from "@/components/ui/card";

export type Tone = "sage" | "clay" | "ink";

const toneCls: Record<Tone, string> = {
  sage: "border-[var(--sage)]/40 bg-[color-mix(in_oklab,var(--sage)_8%,transparent)]",
  clay: "border-[var(--clay)]/40 bg-[color-mix(in_oklab,var(--clay)_8%,transparent)]",
  ink: "border-border bg-muted/30",
};

export function HighlightCard({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <Card className={toneCls[tone]}>
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
