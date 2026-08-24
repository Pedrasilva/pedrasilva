/**
 * Five-state lifecycle rail for a quote:
 *   Draft → Sent → Approved → Signed → Project
 *
 * Presentational only. It replaces the single status pill in the quote header
 * so the route is visible at a glance and the header's one primary button
 * always reads as "the next step".
 */
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/lib/crm/types";

export type QuoteLifecycleState = "draft" | "sent" | "approved" | "signed" | "converted" | "lost";

const ORDER: Exclude<QuoteLifecycleState, "lost">[] = [
  "draft",
  "sent",
  "approved",
  "signed",
  "converted",
];

export function resolveQuoteLifecycle(args: {
  status: QuoteStatus;
  signedAt: string | null;
  hasProject: boolean;
}): QuoteLifecycleState {
  if (args.hasProject) return "converted";
  if (args.status === "rejected") return "lost";
  if (args.status === "approved") return args.signedAt ? "signed" : "approved";
  return args.status === "sent" ? "sent" : "draft";
}

export function QuoteStatusRail({ state }: { state: QuoteLifecycleState }) {
  const { t } = useTranslation("crm");

  if (state === "lost") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
        <span className="h-2 w-2 rounded-full bg-destructive" />
        {t("quotes.lifecycle.lost")}
      </span>
    );
  }

  const currentIdx = ORDER.indexOf(state);

  return (
    <ol className="no-print flex items-center gap-1 rounded-full border bg-card px-1.5 py-1">
      {ORDER.map((s, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
                active && "bg-primary text-primary-foreground font-medium",
                done && "text-emerald-600 dark:text-emerald-400",
                !active && !done && "text-muted-foreground",
              )}
            >
              {done && <Check className="h-3 w-3" />}
              {t(`quotes.lifecycle.${s}`)}
            </span>
            {idx < ORDER.length - 1 && (
              <span className="text-muted-foreground/40" aria-hidden="true">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
