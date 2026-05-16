import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { AlertCircle, AlertTriangle, Info, ChevronRight } from "lucide-react";
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

const severityClass: Record<AlertSeverity, string> = {
  info: "text-sky-600 dark:text-sky-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
};

type Props = {
  alerts: HrAlert[] | undefined;
  loading?: boolean;
};

export function HrAlertList({ alerts, loading }: Props) {
  const { t } = useTranslation("hr");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("dashboard.alerts.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : !alerts || alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("dashboard.alerts.empty")}
          </p>
        ) : (
          alerts.map((a) => {
            const Icon = severityIcon[a.severity];
            const inner = (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2.5 hover:bg-card transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={cn("size-4 shrink-0", severityClass[a.severity])} />
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
                  {a.href ? <ChevronRight className="size-4 text-muted-foreground" /> : null}
                </div>
              </div>
            );
            return a.href ? (
              <Link key={a.id} to={a.href} className="block">
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
