import { AlertTriangle, TrendingDown, UserX, Hourglass, ShieldCheck, Timer } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { euros } from "@/lib/projects/gantt-utils";
import { cn } from "@/lib/utils";

export interface AlertItem {
  id: string;
  kind:
    | "over_budget"
    | "low_margin"
    | "overbooked"
    | "high_internal"
    | "overrun"
    | "approaching_plan";
  /** Pre-translated title and detail (built by the dashboard with collaborator/project names). */
  title: string;
  detail: string;
  href?: { to: string; params?: Record<string, string> };
}

export function AlertsPanel({ alerts, loading }: { alerts: AlertItem[]; loading?: boolean }) {
  const { t } = useTranslation("projects");
  return (
    <section className="flex h-full flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("alerts.title")}
          </h2>
          <p className="text-[11px] text-muted-foreground">{t("alerts.subtitle")}</p>
        </div>
        <span
          className={cn(
            "inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-2 text-[11px] font-semibold",
            alerts.length === 0
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {alerts.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="px-5 py-8 text-center text-xs text-muted-foreground">{t("alerts.scanning")}</p>
        )}
        {!loading && alerts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-5 py-10 text-center">
            <ShieldCheck className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium text-foreground">{t("alerts.allClear")}</p>
            <p className="text-[11px] text-muted-foreground">{t("alerts.allClearDetail")}</p>
          </div>
        )}
        <ul className="divide-y divide-border">
          {alerts.map((a) => (
            <li key={a.id} className="px-5 py-3">
              <AlertRow alert={a} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AlertRow({ alert }: { alert: AlertItem }) {
  const meta = METADATA[alert.kind];
  const body = (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          meta.cls,
        )}
      >
        <meta.icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{alert.title}</p>
        <p className="text-[11px] text-muted-foreground">{alert.detail}</p>
      </div>
    </div>
  );
  if (alert.href) {
    return (
      <Link
        to={alert.href.to}
        params={alert.href.params}
        className="block hover:opacity-80"
      >
        {body}
      </Link>
    );
  }
  return body;
}

const METADATA = {
  over_budget: { icon: AlertTriangle, cls: "bg-destructive/15 text-destructive" },
  low_margin: { icon: TrendingDown, cls: "bg-amber-500/15 text-amber-500" },
  overbooked: { icon: UserX, cls: "bg-destructive/15 text-destructive" },
  high_internal: { icon: Hourglass, cls: "bg-amber-500/15 text-amber-500" },
  overrun: { icon: AlertTriangle, cls: "bg-destructive/15 text-destructive" },
  approaching_plan: { icon: Timer, cls: "bg-amber-500/15 text-amber-500" },
} as const;

// Translated detail builders. Use the live i18n instance so callers (which run
// inside `useMemo`) don't need their own translation hook.
export function overBudgetDetail(actualCost: number, budget: number): string {
  const pct = budget > 0 ? Math.round((actualCost / budget) * 100) : 0;
  return i18n.t("projects:alerts.overBudgetDetail", {
    cost: euros(actualCost),
    pct,
    budget: euros(budget),
  });
}

export function overrunDetail(loggedHours: number, plannedHours: number): string {
  const pct = plannedHours > 0 ? Math.round((loggedHours / plannedHours) * 100) : 0;
  return i18n.t("projects:alerts.overrunDetail", {
    logged: Math.round(loggedHours),
    pct,
    planned: Math.round(plannedHours),
  });
}
