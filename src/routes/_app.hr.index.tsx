import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Users, UserCheck, Plane, Wallet, ClipboardCheck, Coins, CalendarRange, CalendarCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import { useHrDashboardMetrics } from "@/hooks/use-hr-dashboard-metrics";
import { useHrOperationalAlerts } from "@/hooks/use-hr-operational-alerts";
import { useHrCapacityOverview } from "@/hooks/use-hr-capacity-overview";
import { useHrRecentActivity } from "@/hooks/use-hr-recent-activity";
import { HrKpiCard } from "@/components/hr/dashboard/HrKpiCard";
import { HrAlertList } from "@/components/hr/dashboard/HrAlertList";
import { HrCapacityCard } from "@/components/hr/dashboard/HrCapacityCard";
import { HrRecentActivityFeed } from "@/components/hr/dashboard/HrRecentActivityFeed";

export const Route = createFileRoute("/_app/hr/")({
  component: HrDashboard,
});

const fmtEUR = (n: number | null | undefined) =>
  n === null || n === undefined
    ? null
    : new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(n);

function HrDashboard() {
  const { t } = useTranslation("hr");
  const { isAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const canFinance = isAdmin || permissions.has("finance.dashboard");

  const metricsQ = useHrDashboardMetrics();
  const alertsQ = useHrOperationalAlerts();
  const capacityQ = useHrCapacityOverview();
  const activityQ = useHrRecentActivity();

  const m = metricsQ.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </header>

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HrKpiCard
          label={t("dashboard.kpi.activeCollaborators")}
          value={m?.activeCollaborators ?? 0}
          icon={Users}
          loading={metricsQ.isLoading}
        />
        <HrKpiCard
          label={t("dashboard.kpi.onLeaveToday")}
          value={m?.onLeaveToday ?? 0}
          icon={Plane}
          loading={metricsQ.isLoading}
          tone={(m?.onLeaveToday ?? 0) > 0 ? "warning" : "default"}
        />
        <HrKpiCard
          label={t("dashboard.kpi.pendingReimbursements")}
          value={m?.pendingReimbursementApprovals ?? 0}
          icon={ClipboardCheck}
          loading={metricsQ.isLoading}
          tone={(m?.pendingReimbursementApprovals ?? 0) > 0 ? "warning" : "default"}
        />
        <HrKpiCard
          label={t("dashboard.kpi.upcomingLeave30")}
          value={m?.upcomingLeaveNext30 ?? 0}
          icon={CalendarRange}
          loading={metricsQ.isLoading}
        />

        {/* Finance-gated row */}
        <HrKpiCard
          label={t("dashboard.kpi.monthlyPayroll")}
          value={fmtEUR(m?.monthlyPayrollTotal)}
          icon={Wallet}
          loading={metricsQ.isLoading}
          hidden={!canFinance}
        />
        <HrKpiCard
          label={t("dashboard.kpi.approvedUnpaidReimb")}
          value={m?.approvedUnpaidReimbursements ?? 0}
          sub={
            m?.approvedUnpaidReimbursementsAmount
              ? fmtEUR(m.approvedUnpaidReimbursementsAmount) ?? undefined
              : undefined
          }
          icon={Coins}
          loading={metricsQ.isLoading}
          hidden={!canFinance}
          tone={(m?.approvedUnpaidReimbursements ?? 0) > 0 ? "warning" : "default"}
        />
        <HrKpiCard
          label={t("dashboard.kpi.workingDaysMonth")}
          value={m?.workingDaysThisMonth ?? null}
          icon={CalendarCheck}
          loading={metricsQ.isLoading}
          hidden={!canFinance}
        />
        <HrKpiCard
          label={t("dashboard.kpi.archived")}
          value={m?.archivedCollaborators ?? 0}
          icon={UserCheck}
          loading={metricsQ.isLoading}
        />
      </section>

      {/* Alerts + Capacity */}
      <section className="grid gap-4 lg:grid-cols-2">
        <HrAlertList alerts={alertsQ.data} loading={alertsQ.isLoading} />
        <HrCapacityCard data={capacityQ.data} loading={capacityQ.isLoading} />
      </section>

      {/* Activity */}
      <section>
        <HrRecentActivityFeed items={activityQ.data} loading={activityQ.isLoading} />
      </section>
    </div>
  );
}
