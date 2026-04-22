import { Activity, Clock, Hourglass, Timer, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface HoursKpiData {
  plannedHours: number;
  loggedHours: number;
  remainingHours: number;
  utilizationPct: number;
  capacityUsedHours: number;
  capacityAvailableHours: number;
}

export function HoursKpiStrip({
  data,
  loading,
  periodLabel,
}: {
  data: HoursKpiData;
  loading?: boolean;
  periodLabel: string;
}) {
  const { t } = useTranslation("projects");
  const remainingTone =
    data.remainingHours < 0
      ? "danger"
      : data.plannedHours > 0 && data.remainingHours / data.plannedHours < 0.2
        ? "warning"
        : "success";
  const utilTone =
    data.utilizationPct >= 75 && data.utilizationPct <= 90
      ? "success"
      : data.utilizationPct < 60
        ? "danger"
        : "warning";
  const capacityPct =
    data.capacityAvailableHours > 0
      ? (data.capacityUsedHours / data.capacityAvailableHours) * 100
      : 0;

  return (
    <section className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("kpi.productionPerformance")}
        </h2>
        <span className="text-[11px] text-muted-foreground">{periodLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCell
          icon={<Hourglass className="h-4 w-4" />}
          tone="primary"
          label={t("kpi.plannedHours")}
          value={loading ? "…" : <span className="font-mono">{Math.round(data.plannedHours)}h</span>}
          sub={t("kpi.plannedHoursSub")}
        />
        <KpiCell
          icon={<Clock className="h-4 w-4" />}
          tone="muted"
          label={t("kpi.loggedHours")}
          value={loading ? "…" : <span className="font-mono">{Math.round(data.loggedHours)}h</span>}
          sub={t("kpi.loggedHoursSub")}
        />
        <KpiCell
          icon={<Timer className="h-4 w-4" />}
          tone={remainingTone}
          label={t("kpi.remaining")}
          value={
            loading ? "…" : (
              <span className="font-mono">
                {Math.round(data.remainingHours)}h
              </span>
            )
          }
          sub={t("kpi.remainingSub")}
        />
        <KpiCell
          icon={<Activity className="h-4 w-4" />}
          tone={utilTone}
          label={t("kpi.utilization")}
          value={loading ? "…" : `${Math.round(data.utilizationPct)}%`}
          sub={t("kpi.utilizationSub")}
        />
        <KpiCell
          icon={<Users className="h-4 w-4" />}
          tone="primary"
          label={t("kpi.capacityUsed")}
          value={
            loading ? "…" : (
              <>
                {Math.round(data.capacityUsedHours)}
                <span className="text-muted-foreground">
                  {" / "}
                  {Math.round(data.capacityAvailableHours)}h
                </span>
              </>
            )
          }
          sub={t("kpi.capacityOfAvailable", { pct: Math.round(capacityPct) })}
        />
      </div>
    </section>
  );
}

function KpiCell({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  tone: "primary" | "muted" | "success" | "danger" | "warning";
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  const toneCls = {
    primary: "bg-primary/15 text-primary",
    muted: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/15 text-emerald-500",
    danger: "bg-destructive/15 text-destructive",
    warning: "bg-amber-500/15 text-amber-500",
  }[tone];
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          toneCls,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-base font-semibold tracking-tight text-foreground">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
