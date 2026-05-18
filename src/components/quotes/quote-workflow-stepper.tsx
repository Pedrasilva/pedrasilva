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
}: {
  step: QuoteStep;
  onChange: (next: QuoteStep) => void;
  completion: QuoteStepCompletion;
}) {
  const { t } = useTranslation("crm");

  return (
    <nav
      aria-label={t("workspace.stepper.ariaLabel")}
      className="no-print rounded-lg border bg-card p-2"
    >
      <ol className="flex flex-wrap items-stretch gap-1">
        {QUOTE_STEPS.map((s, idx) => {
          const isActive = s === step;
          const isDone = completion[s];
          return (
            <li key={s} className="flex-1 min-w-[180px]">
              <button
                type="button"
                onClick={() => onChange(s)}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    isActive
                      ? "border-primary-foreground/40 bg-primary-foreground/10"
                      : isDone
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-muted-foreground/30 bg-background text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {isDone && !isActive ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold leading-tight truncate">
                    {t(`workspace.stepper.${s}.title`)}
                  </span>
                  <span
                    className={cn(
                      "text-xs leading-tight truncate",
                      isActive
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(`workspace.stepper.${s}.hint`)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
