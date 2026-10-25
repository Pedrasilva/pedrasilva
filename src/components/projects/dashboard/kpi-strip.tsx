import { useTranslation } from "react-i18next";
import i18n from "@/i18n/index";
import { Briefcase, CheckCircle2, Tag, BatteryWarning, BatteryCharging } from "lucide-react";
import { euros } from "@/lib/projects/gantt-utils";
import { formatHM } from "@/lib/projects/time-format";
import { cn } from "@/lib/utils";

export interface KpiStripData {
  workInProgressHours: number;
  workInProgressValue: number;
  remainingHours: number;
  workDoneTodayHours: number;
  workDoneTodayValue: number;
  weekHours: number;
  billablePctThisWeek: number;
  billableHoursThisWeek: number;
  unapprovedHours: number;
  unapprovedValue: number;
  approvedUninvoicedHours: number;
  approvedUninvoicedValue: number;
}

export function KpiStrip({ data, loading }: { data: KpiStripData; loading?: boolean }) {
  useTranslation();
  return (
    <section className="rounded-lg border border-border bg-card px-5 py-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
         {i18n.t("projects:kpiStrip.ui.projectWork")} </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCell
          icon={<Briefcase className="h-4 w-4" />}
          tone="primary"
          label={i18n.t("projects:kpiStrip.ui.workInProgress")}
          value={
            loading ? "…" : (
              <>
                {formatHM(data.workInProgressHours)}{" "}
                <span className="text-muted-foreground">/</span>{" "}
                <span className="font-mono">{euros(data.workInProgressValue)}</span>
              </>
            )
          }
          sub={loading ? "" : `${formatHM(data.remainingHours)} remaining`}
        />
        <KpiCell
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="muted"
          label={i18n.t("projects:kpiStrip.ui.workDoneToday")}
          value={
            loading ? "…" : (
              <>
                {formatHM(data.workDoneTodayHours)}{" "}
                <span className="text-muted-foreground">/</span>{" "}
                <span className="font-mono">{euros(data.workDoneTodayValue)}</span>
              </>
            )
          }
          sub={loading ? "" : `${formatHM(data.weekHours)} this week`}
        />
        <KpiCell
          icon={<Tag className="h-4 w-4" />}
          tone="success"
          label={i18n.t("projects:kpiStrip.ui.billableWorkThisWeek")}
          value={loading ? "…" : `${data.billablePctThisWeek}%`}
          sub={loading ? "" : `${formatHM(data.billableHoursThisWeek)} billable this week`}
        />
        <KpiCell
          icon={<BatteryWarning className="h-4 w-4" />}
          tone="danger"
          label={i18n.t("projects:kpiStrip.ui.unapprovedWork")}
          value={
            loading ? "…" : (
              <>
                {formatHM(data.unapprovedHours)}{" "}
                <span className="text-muted-foreground">/</span>{" "}
                <span className="font-mono">{euros(data.unapprovedValue)}</span>
              </>
            )
          }
        />
        <KpiCell
          icon={<BatteryCharging className="h-4 w-4" />}
          tone="warning"
          label={i18n.t("projects:kpiStrip.ui.approvedUninvoiced")}
          value={
            loading ? "…" : (
              <>
                {formatHM(data.approvedUninvoicedHours)}{" "}
                <span className="text-muted-foreground">/</span>{" "}
                <span className="font-mono">{euros(data.approvedUninvoicedValue)}</span>
              </>
            )
          }
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
  useTranslation();
  const toneCls = {
    primary: "bg-primary/15 text-primary",
    muted: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/15 text-emerald-500",
    danger: "bg-destructive/15 text-destructive",
    warning: "bg-amber-500/15 text-amber-500",
  }[tone];
  return (
    <div className="flex items-start gap-3">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", toneCls)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-base font-semibold tracking-tight text-foreground">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
