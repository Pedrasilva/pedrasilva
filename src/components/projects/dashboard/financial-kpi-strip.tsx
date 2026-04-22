import { TrendingUp, Receipt, Wallet, Activity, Users } from "lucide-react";
import { euros } from "@/lib/projects/gantt-utils";
import { cn } from "@/lib/utils";

export interface FinancialKpiData {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  utilizationPct: number;
  capacityUsedHours: number;
  capacityAvailableHours: number;
}

export function FinancialKpiStrip({
  data,
  loading,
  periodLabel,
}: {
  data: FinancialKpiData;
  loading?: boolean;
  periodLabel: string;
}) {
  const profitTone =
    data.profit < 0 ? "danger" : data.marginPct < 15 ? "warning" : "success";
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
          Business performance
        </h2>
        <span className="text-[11px] text-muted-foreground">{periodLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCell
          icon={<Receipt className="h-4 w-4" />}
          tone="primary"
          label="Revenue"
          value={loading ? "…" : <span className="font-mono">{euros(data.revenue)}</span>}
          sub="Billable hours × sale rate"
        />
        <KpiCell
          icon={<Wallet className="h-4 w-4" />}
          tone="muted"
          label="Total cost"
          value={loading ? "…" : <span className="font-mono">{euros(data.cost)}</span>}
          sub="All logged hours × cost rate"
        />
        <KpiCell
          icon={<TrendingUp className="h-4 w-4" />}
          tone={profitTone}
          label="Profit"
          value={
            loading ? "…" : (
              <>
                <span className="font-mono">{euros(data.profit)}</span>{" "}
                <span className="text-xs font-medium text-muted-foreground">
                  ({Math.round(data.marginPct)}%)
                </span>
              </>
            )
          }
          sub="Revenue − cost"
        />
        <KpiCell
          icon={<Activity className="h-4 w-4" />}
          tone={utilTone}
          label="Utilization"
          value={loading ? "…" : `${Math.round(data.utilizationPct)}%`}
          sub="Billable / total logged"
        />
        <KpiCell
          icon={<Users className="h-4 w-4" />}
          tone="primary"
          label="Capacity used"
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
          sub={`${Math.round(capacityPct)}% of available`}
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
