import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertCategory = "hr" | "finance" | "config";

export type HrAlert = {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  /** i18n key under hr:dashboard.alerts.<key>.title */
  i18nKey: string;
  count: number;
  /** Optional internal href */
  href?: string;
};

const STALE_DAYS_PENDING_EXPENSE = 7;

export function useHrOperationalAlerts() {
  const { user, isAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const canApproveBenefits = isAdmin || permissions.has("hr.beneficios.approve");
  const canSeeFinance = isAdmin || permissions.has("finance.dashboard");
  const canSeeCollaborators = isAdmin || permissions.has("hr.colaboradores");

  return useQuery({
    queryKey: [
      "hr-operational-alerts",
      user?.id,
      isAdmin,
      canApproveBenefits,
      canSeeFinance,
      canSeeCollaborators,
    ],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<HrAlert[]> => {
      const alerts: HrAlert[] = [];
      const staleSince = new Date(Date.now() - STALE_DAYS_PENDING_EXPENSE * 86400000)
        .toISOString();

      // ---- HR approvals ----
      if (canApproveBenefits) {
        const { count: pendingExp } = await supabase
          .from("benefit_expenses")
          .select("id", { count: "exact", head: true })
          .eq("estado", "pendente");
        if ((pendingExp ?? 0) > 0) {
          alerts.push({
            id: "benefits-pending",
            category: "hr",
            severity: "warning",
            i18nKey: "benefitsPending",
            count: pendingExp ?? 0,
            href: "/hr/beneficios",
          });
        }

        const { count: stalePending } = await supabase
          .from("benefit_expenses")
          .select("id", { count: "exact", head: true })
          .eq("estado", "pendente")
          .lt("created_at", staleSince);
        if ((stalePending ?? 0) > 0) {
          alerts.push({
            id: "benefits-stale",
            category: "hr",
            severity: "critical",
            i18nKey: "benefitsStale",
            count: stalePending ?? 0,
            href: "/hr/beneficios",
          });
        }
      }

      if (canSeeCollaborators) {
        const { count: vacPending } = await supabase
          .from("vacation_requests")
          .select("id", { count: "exact", head: true })
          .eq("estado", "pendente");
        if ((vacPending ?? 0) > 0) {
          alerts.push({
            id: "vacation-pending",
            category: "hr",
            severity: "warning",
            i18nKey: "vacationPending",
            count: vacPending ?? 0,
            href: "/hr/ferias",
          });
        }
      }

      // ---- Finance integration ----
      if (canSeeFinance) {
        // Approved but no FEI
        const { data: approvedNoFei } = await supabase.rpc(
          "hr_dashboard_alerts_finance",
        );
        // Fallback: compute inline if RPC missing (best-effort)
        let approvedNoFeiCount = 0;
        let feiPaidHrNotPagaCount = 0;
        let syncFailedCount = 0;
        let noPeriodCount = 0;

        if (approvedNoFei && typeof approvedNoFei === "object") {
          const r = approvedNoFei as {
            approved_no_fei?: number;
            fei_paid_hr_not_paga?: number;
            sync_failed?: number;
            no_period?: number;
          };
          approvedNoFeiCount = r.approved_no_fei ?? 0;
          feiPaidHrNotPagaCount = r.fei_paid_hr_not_paga ?? 0;
          syncFailedCount = r.sync_failed ?? 0;
          noPeriodCount = r.no_period ?? 0;
        }

        if (approvedNoFeiCount > 0) {
          alerts.push({
            id: "fin-approved-no-fei",
            category: "finance",
            severity: "critical",
            i18nKey: "approvedNoFei",
            count: approvedNoFeiCount,
          });
        }
        if (feiPaidHrNotPagaCount > 0) {
          alerts.push({
            id: "fin-fei-paid-hr-drift",
            category: "finance",
            severity: "critical",
            i18nKey: "feiPaidHrDrift",
            count: feiPaidHrNotPagaCount,
          });
        }
        if (syncFailedCount > 0) {
          alerts.push({
            id: "fin-sync-failed",
            category: "finance",
            severity: "critical",
            i18nKey: "syncFailed",
            count: syncFailedCount,
          });
        }
        if (noPeriodCount > 0) {
          alerts.push({
            id: "fin-no-period",
            category: "finance",
            severity: "warning",
            i18nKey: "reimbNoPeriod",
            count: noPeriodCount,
          });
        }
      }

      // ---- Configuration ----
      if (isAdmin) {
        // Active collabs with no effective salary snapshot
        const { data: activeCols } = await supabase
          .from("collaborators")
          .select("id")
          .is("archived_at", null);
        const ids = ((activeCols ?? []) as Array<{ id: string }>).map((c) => c.id);
        if (ids.length > 0) {
          const { data: snaps } = await supabase
            .from("salary_snapshots")
            .select("collaborator_id")
            .eq("is_effective", true)
            .in("collaborator_id", ids);
          const withSnap = new Set(
            ((snaps ?? []) as Array<{ collaborator_id: string }>).map(
              (s) => s.collaborator_id,
            ),
          );
          const missing = ids.length - withSnap.size;
          if (missing > 0) {
            alerts.push({
              id: "cfg-missing-salary",
              category: "config",
              severity: "warning",
              i18nKey: "missingSalary",
              count: missing,
              href: "/hr/colaboradores",
            });
          }
        }
      }

      return alerts;
    },
  });
}
