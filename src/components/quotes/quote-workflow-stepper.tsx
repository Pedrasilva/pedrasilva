import type { QuoteLifecycleState } from "@/lib/quotes/quote-lifecycle";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuoteStep = "estimate" | "content" | "publish";

export const QUOTE_STEPS: QuoteStep[] = ["estimate", "content", "publish"];

export type QuoteStepCompletion = Record<QuoteStep, boolean>;

/**
 * Linear 3-step workflow header for the quote workspace.
 *
 * This is presentational only — it does NOT enforce ordering or block
 * navigation. Steps are click-to-switch and completion ticks are soft
 * indicators derived from existing data. All underlying quote tabs,
 * components and logic are preserved unchanged below the stepper.
 */
export function QuoteWorkflowStepper({
  step,
  onChange,
  completion,
  lifecycle,
}: {
  step: QuoteStep;
  lifecycle: QuoteLifecycleState;
  onChange: (next: QuoteStep) => void;
  completion: QuoteStepCompletion;
}) {
  const { t } = useTranslation("crm");

  return (
    <nav aria-label={t("workspace.stepper.ariaLabel")} className="no-print shrink-0">
      <ol className="flex items-center gap-0.5">
        {QUOTE_STEPS.map((s, idx) => (
          <li key={s} className="flex items-center gap-0.5">
            {idx > 0 && <span aria-hidden="true" className="text-muted-foreground">›</span>}
            <Button variant="ghost" size="sm" onClick={() => onChange(s)} aria-current={s === step ? "step" : undefined}
              className={cn("gap-1.5 whitespace-nowrap px-2", s === step ? "text-foreground font-semibold" : "text-muted-foreground")}>
              {s === step ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" /> : completion[s] ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" /> : <span aria-hidden="true" className="h-2 w-2 rounded-full border border-muted-foreground" />}
              {t(`builderHeader.${s}`)}
            </Button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
