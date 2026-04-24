/**
 * QuoteWarningsBanner — renders a stack of lightweight, non-blocking
 * warnings produced by `buildQuoteWarnings`.
 *
 * Severity → visual treatment:
 *   - info    → muted (border-border, bg-muted)
 *   - warn    → amber (border-amber-500/40, bg-amber-50 dark:amber-950/30)
 *   - danger  → rose  (border-rose-500/40, bg-rose-50 dark:rose-950/30)
 *
 * Empty list renders nothing — never reserves space.
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle, Info, AlertOctagon } from "lucide-react";
import type { QuoteWarning } from "@/lib/quotes/quote-warnings";

const styles = {
  info: {
    box: "border-border bg-muted text-foreground",
    icon: Info,
    iconCls: "text-muted-foreground",
  },
  warn: {
    box: "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
    icon: AlertTriangle,
    iconCls: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    box: "border-rose-500/40 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200",
    icon: AlertOctagon,
    iconCls: "text-rose-600 dark:text-rose-400",
  },
} as const;

export function QuoteWarningsBanner({ warnings }: { warnings: QuoteWarning[] }) {
  const { t } = useTranslation("crm");
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => {
        const s = styles[w.severity];
        const Icon = s.icon;
        return (
          <div
            key={`${w.id}-${i}`}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${s.box}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconCls}`} />
            <span>{t(`workspace.warnings.${w.id}`, w.values ?? {})}</span>
          </div>
        );
      })}
    </div>
  );
}
