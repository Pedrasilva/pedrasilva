import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { AlertCircle, AlertTriangle, Info, ChevronRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { HrAlert, AlertSeverity } from "@/hooks/use-hr-operational-alerts";

const severityIcon = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
} as const;

const severityIconClass: Record<AlertSeverity, string> = {
  info: "text-sky-600 dark:text-sky-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
};

const severityRowClass: Record<AlertSeverity, string> = {
  info: "border-l-2 border-l-sky-500/60 bg-sky-500/[0.03]",
  warning: "border-l-2 border-l-amber-500/70 bg-amber-500/[0.04]",
  critical: "border-l-2 border-l-red-500/80 bg-red-500/[0.05]",
};

const severityOrder: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

type Props = {
  alerts: HrAlert[] | undefined;
  loading?: boolean;
};

export function HrAlertList({ alerts, loading }: Props) {
  const { t } = useTranslation("hr");
  const sorted = (alerts ?? []).slice().sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );
  const criticalCount = sorted.filter((a) => a.severity === "critical").length;

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("dashboard.alerts.title")}</CardTitle>
        {!loading && sorted.length > 0 ? (
          <Badge
            variant="outline"
            className={cn(
              "tabular-nums",
              criticalCount > 0 && "border-red-500/40 text-red-600 dark:text-red-400",
            )}
          >
            {sorted.length}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <CheckCircle2 className="size-5 text-emerald-600/70 dark:text-emerald-400/70" />
            <p className="text-sm text-muted-foreground">
              {t("dashboard.alerts.allClear")}
            </p>
          </div>
        ) : (
          sorted.map((a) => {
            const Icon = severityIcon[a.severity];
            const inner = (
              <div
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors",
                  severityRowClass[a.severity],
                  a.href && "hover:bg-accent/60",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={cn("size-4 shrink-0", severityIconClass[a.severity])} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {t(`dashboard.alerts.${a.i18nKey}.title`)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t(`dashboard.alerts.${a.i18nKey}.body`, { count: a.count })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="tabular-nums">
                    {a.count}
                  </Badge>
                  {a.href ? (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  ) : null}
                </div>
              </div>
            );
            return a.href ? (
              <Link
                key={a.id}
                to={a.href}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                aria-label={t(`dashboard.alerts.${a.i18nKey}.title`)}
              >
                {inner}
              </Link>
            ) : (
              <div key={a.id}>{inner}</div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
