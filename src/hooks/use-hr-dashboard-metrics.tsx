import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";

export type HrDashboardMetrics = {
  // People
  activeCollaborators: number;
  archivedCollaborators: number;
  onLeaveToday: number;
  // Compensation (gated)
  monthlyPayrollTotal: number | null;
  approvedUnpaidReimbursements: number | null;
  approvedUnpaidReimbursementsAmount: number | null;
  pendingReimbursementApprovals: number;
  // Capacity
  upcomingLeaveNext30: number;
  workingDaysThisMonth: number | null;
};

function monthBounds(d = new Date()): { start: string; end: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export function useHrDashboardMetrics() {
  const { user, isAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const canFinance = isAdmin || permissions.has("finance.dashboard");

  return useQuery({
    queryKey: ["hr-dashboard-metrics", user?.id, isAdmin, canFinance],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<HrDashboardMetrics> => {
      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const { start, end } = monthBounds();

      const [
        activeQ,
        archivedQ,
        onLeaveTodayQ,
        upcomingQ,
        pendingApprovalsQ,
      ] = await Promise.all([
        supabase
          .from("collaborators")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null),
        supabase
          .from("collaborators")
          .select("id", { count: "exact", head: true })
          .not("archived_at", "is", null),
        supabase
          .from("vacation_requests")
          .select("id", { count: "exact", head: true })
          .eq("estado", "aprovada")
          .lte("data_inicio", today)
          .gte("data_fim", today),
        supabase
          .from("vacation_requests")
          .select("id", { count: "exact", head: true })
          .eq("estado", "aprovada")
          .gte("data_inicio", today)
          .lte("data_inicio", in30),
        supabase
          .from("benefit_expenses")
          .select("id", { count: "exact", head: true })
          .eq("estado", "pendente"),
      ]);

      let monthlyPayrollTotal: number | null = null;
      let approvedUnpaidCount: number | null = null;
      let approvedUnpaidAmount: number | null = null;
      let workingDaysThisMonth: number | null = null;

      if (canFinance) {
        // Approved & unpaid reimbursement liabilities (Finance side)
        const { data: feis } = await supabase
          .from("financial_expense_items")
          .select("amount_inc_vat, actual_amount_inc_vat, amount_ex_vat")
          .eq("source_ref_table", "benefit_expenses")
          .eq("status", "confirmed");
        const rows = (feis ?? []) as Array<{
          amount_inc_vat: number | null;
          actual_amount_inc_vat: number | null;
          amount_ex_vat: number | null;
        }>;
        approvedUnpaidCount = rows.length;
        approvedUnpaidAmount = rows.reduce(
          (acc, r) =>
            acc +
            Number(r.actual_amount_inc_vat ?? r.amount_inc_vat ?? r.amount_ex_vat ?? 0),
          0,
        );

        // Monthly payroll = sum of effective salary snapshots for active collabs
        const { data: snaps } = await supabase
          .from("salary_snapshots")
          .select("valor_base, meses_pagos, collaborator_id, is_effective")
          .eq("is_effective", true);
        if (snaps) {
          monthlyPayrollTotal = (snaps as Array<{ valor_base: number | null }>).reduce(
            (acc, r) => acc + Number(r.valor_base ?? 0),
            0,
          );
        }

        // Working days this month (only if config exists)
        const { count: wdCount } = await supabase
          .from("workdays")
          .select("id", { count: "exact", head: true })
          .gte("data", start)
          .lte("data", end)
          .eq("is_workday", true);
        workingDaysThisMonth = wdCount ?? null;
      }

      return {
        activeCollaborators: activeQ.count ?? 0,
        archivedCollaborators: archivedQ.count ?? 0,
        onLeaveToday: onLeaveTodayQ.count ?? 0,
        monthlyPayrollTotal,
        approvedUnpaidReimbursements: approvedUnpaidCount,
        approvedUnpaidReimbursementsAmount: approvedUnpaidAmount,
        pendingReimbursementApprovals: pendingApprovalsQ.count ?? 0,
        upcomingLeaveNext30: upcomingQ.count ?? 0,
        workingDaysThisMonth,
      };
    },
  });
}
