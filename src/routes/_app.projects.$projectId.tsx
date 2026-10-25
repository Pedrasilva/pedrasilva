import { useDateLocale } from "@/i18n/use-date-locale";
import i18n from "@/i18n/index";
import { financialResult, completionForecast, plannedAllocationFigures } from "@/lib/projects/financial-calculation";
import { useProjectEntryFigures } from "@/lib/projects/use-project-entry-figures";
import { rollupExternalServices, rollupExpenses, sumFinancialsRows } from "@/lib/projects/financial-rollups";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip as UiTip, TooltipContent as UiTipContent, TooltipTrigger as UiTipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import * as RC from "recharts";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useRecordRecentlyViewed } from "@/hooks/use-recently-viewed";
import { AppShell } from "@/components/projects/app-shell";
import { GanttChart } from "@/components/projects/gantt-chart";
import { ProjectGantt } from "@/components/planner/planner-gantt";
import { useProjectPlannerAdapter } from "@/lib/projects/use-project-planner-adapter";
import { useAuth } from "@/hooks/use-auth";
import { ProjectPlannerInspector } from "@/components/projects/project-planner-inspector";
import { ResourcePool } from "@/components/projects/resource-pool";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { useStageBilled } from '@/lib/finance/use-provisional-invoicing';
import { useFinanceAccess } from '@/hooks/use-finance-access';

import { NewStageDialog } from "@/components/projects/new-stage-dialog";
import { ProjectNotesTab } from "@/components/projects/notes/project-notes-tab";
import { NewRetainerStageDialog } from "@/components/projects/new-retainer-stage-dialog";
import {
  useProjectDetail,
  useResources,
  useUpdateProject,
  useCreateStage,
  useUpdateStage,
  useDeleteStage,
} from "@/lib/projects/use-planner";
import {
  buildProjectGanttTree,
  PROJECT_SUMMARY_ID,
} from "@/lib/projects/build-project-gantt-tree";
import type { PaymentMilestone } from "@/components/projects/gantt-chart";
import { toast } from "sonner";
import {
  allocationCost,
  allocationHours,
  euros,
} from "@/lib/projects/gantt-utils";
import {
  useDefaultResourceRates,
  effectiveCostRate,
  effectiveSaleRate,
} from "@/lib/projects/use-default-rates";
import { useProjectInvoices } from "@/lib/projects/use-invoices";
import { ProjectClientField } from "@/components/projects/project-client-field";
import { ProjectTeamCard } from "@/components/projects/project-team-card";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { useProjectActivities } from "@/lib/projects/use-activities";
import { useHasPermission } from "@/hooks/use-permissions";
import { useExternalServices } from "@/lib/projects/use-external-services";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useProjectExpenses } from "@/lib/projects/use-project-expenses";
import { ExternalServicesSection } from "@/components/projects/external-services-section";
import { ProjectExpensesSection } from "@/components/projects/project-expenses-section";
import { ProjectBillingTab } from "@/components/finance/project-billing-tab";
import { PaymentsReceived } from "@/components/finance/recebimentos-panel";
import { ProjectPursuitCard } from "@/components/projects/project-pursuit-card";
import { usePursuitTotals, pursuitByProject } from "@/lib/projects/use-pursuit";
import { ProjectFinancialTab } from "@/components/projects/project-financial-tab";
import { HardDeleteProjectButton } from "@/components/projects/hard-delete-project-button";
import { useHistoricalProjectTotals, EMPTY_HISTORICAL_TOTALS, type HistoricalProjectTotals } from "@/lib/projects/use-historical-time";
import { useStageBudgetControl } from "@/lib/projects/use-stage-budget-control";
import { BudgetControlPanel } from "@/components/projects/budget-control-panel";
import { RetainerMonitorPanel } from "@/components/projects/retainer-monitor-panel";
import { ApprovalsPanel } from "@/components/projects/approvals-panel";
import { useProjectPendingHours } from "@/lib/projects/use-hour-approvals";
import { CommercialBaselineCard } from "@/components/projects/commercial-baseline-card";
import { ContractBaselineCard } from "@/components/projects/contract-baseline-card";
import { ContractDiffCard } from "@/components/projects/contract-diff-card";
import { ProjectForecastCard } from "@/components/projects/project-forecast-card";
import { ProjectSyncStatusBadge } from "@/components/projects/project-sync-status-badge";
import { useContractBaseline } from "@/lib/projects/use-contract-baseline";
import { QuotePlanningTab } from "@/components/quotes/quote-planning-tab";
import { useTeamPricingAverages } from "@/lib/quotes/use-team-pricing-averages";
import { QuotePaymentScheduleTab } from "@/components/quotes/quote-payment-schedule-tab";
import {
  QuoteFinancialSummaryTab,
  ArchitectureFinancialBreakdown,
} from "@/components/quotes/quote-financial-summary-tab";
import {
  Calendar as CalendarIcon2,
  Building2,
  Users as UsersIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  PieChart as PieChartIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AllocationRowActions,
  StageRowActions,
  StageStatusCell,
  normalizeStageStatus,
} from "@/components/projects/stage-row-actions";
import { useAllocationTaskNames } from "@/lib/projects/use-stage-tasks";
import {
  computeStageEnvelope,
  resolveTargetMargin,
  useStageTargetMargins,
  type EnvelopeAllocation,
} from "@/lib/projects/use-stage-envelope";
import { CreateStageTaskDialog } from "@/components/projects/create-stage-task-dialog";

import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Pause,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Receipt,
  Package,
  Activity as ActivityIcon,
  Repeat,
  ListChecks,
  Mail,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronRight,
  ChevronDown,
  Search,
  ArrowUpDown,
  Plus,
  Pencil,
  DollarSign,
  FileText,
} from "lucide-react";

export const Route = createFileRoute("/_app/projects/$projectId")({
  head: () => ({meta:[{title:"Project planning | Pedra Silva Hub"},{name:"description",content:"Project stages, planning and logged hours in Pedra Silva Hub."},{property:"og:title",content:"Project planning | Pedra Silva Hub"},{property:"og:description",content:"Project stages, planning and logged hours in Pedra Silva Hub."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),
  component: ProjectDetail,
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    return tab ? { tab } : {};
  },
});

type TabKey =
  | "overview"
  | "schedule"
  | "materials"
  | "expenses"
  | "rates"
  | "billing"
  | "financial"
  | "insights"
  | "ap"
  | "approvals"
  | "stream"
  | "planning"
  | "architecture"
  | "consultants"
  | "incoming"
  | "outgoing"
  | "paymentSchedule"
  | "financialSummary"
  | "notes";


function ProjectDetail() {
  const dateLocale = useDateLocale();
  const { t } = useTranslation();
  const projectFinanceAccess = useFinanceAccess();
  const { projectId } = Route.useParams();
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const { data, isLoading, error } = useProjectDetail(projectId, { includeCancelled: showCancelled });
  const { data: resources } = useResources();
  const { isAdmin, user } = useAuth();
  // Planning edit rights: admin, or v2 permission (all scope), or assigned
  // scope on a project this user is actually assigned to. Mirrors the RLS
  // write policies on pm_stages / pm_allocations / pm_stage_dependencies.
  const { can: canV2 } = useMyPermissionsV2();
  const { data: isAssignedToProject } = useQuery({
    queryKey: ["pm-assigned-access", user?.id, projectId],
    enabled: !!user?.id && !!projectId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pm_has_assigned_access", {
        _user_id: user!.id,
        _project_id: projectId,
      });
      if (error) throw error;
      return !!data;
    },
  });
  const canEditPlanning =
    isAdmin ||
    canV2("projects.edit_planning", "all") ||
    (canV2("projects.edit_planning", "assigned") && !!isAssignedToProject);
  const ganttAdapter = useProjectPlannerAdapter(resources ?? [], { readOnly: !canEditPlanning });

  const { data: defaultRates } = useDefaultResourceRates();
  const { data: invoices } = useProjectInvoices(projectId);
  const { data: activities } = useProjectActivities(projectId);
  const updateProject = useUpdateProject();
  const { allowed: canSeeFinancials } = useHasPermission("projects.financials");
  const { data: budgetControl } = useStageBudgetControl({ projectId, defaultRates });
  const { data: teamAvg } = useTeamPricingAverages();
  const avgSaleRate = teamAvg?.avgSalePerHour ?? 0;
  const entryFiguresQ = useProjectEntryFigures(projectId, data?.stages, resources, defaultRates, canSeeFinancials);

  useRecordRecentlyViewed({
    module: "projects",
    href: `/projects/${projectId}`,
    label: data?.project?.name ?? "",
  });

  const search = Route.useSearch();
  const [tab, setTab] = useState<TabKey>((search?.tab as TabKey) || "overview");
  const [insightsScopeStageId, setInsightsScopeStageId] = useState<string | null>(null);
  const baselineQ = useContractBaseline(projectId);
  const sourceQuoteId = baselineQ.data?.header.quote_id ?? null;
  const baselineMultiplier = Number(baselineQ.data?.header.pricing_multiplier ?? 1) || 1;

  const [dayWidth, setDayWidth] = useState(36);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [poolOpen, setPoolOpen] = useState(false);
  const [collapsedOutline, setCollapsedOutline] = useState<Set<string>>(new Set());
  const toggleOutlineCollapse = (id: string) =>
    setCollapsedOutline((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStageMut = useDeleteStage();

  const { data: historical } = useHistoricalProjectTotals(projectId);
  const hist = historical ?? EMPTY_HISTORICAL_TOTALS;
  // Pre-contract (pursuit) hours on this project's CRM lead — folded into cost.
  const { data: pursuitRows } = usePursuitTotals([projectId], canSeeFinancials);
  const pursuit = useMemo(
    () =>
      pursuitByProject(
        pursuitRows ?? [],
        (rid) => {
          const r = resources?.find((x) => x.id === rid);
          return r
            ? { cost_rate: r.cost_rate, isOverride: !!(r as { hourly_rate_is_override?: boolean }).hourly_rate_is_override }
            : undefined;
        },
        defaultRates,
      ).get(projectId) ?? { hours: 0, cost: 0 },
    [pursuitRows, resources, defaultRates, projectId],
  );

  // Real time entries for this project. Keep the entry month so Insights can
  // chart hours even when no separate activity/feed item was created.
  const { data: timeRows } = useQuery({
    queryKey: ["pm-project-time", projectId],
    enabled: !!projectId && !!data,
    queryFn: async () => {
      if (!data)
        return [] as { stage_id: string; month: string; hours: number; billableHours: number; nonBillableHours: number; snapCost: number; unsnapHours: number }[];
      // Aggregated, privacy-safe hours per stage/month. This lets any team
      // member with project visibility see how the project is performing
      // time-wise, not only their own logged hours (RLS on pm_time_entries
      // restricts non-admins to their own rows).
      const summary = await supabase.rpc("pm_project_stage_hours", {
        p_project_id: projectId,
      });
      if (!summary.error && summary.data) {
        // Locked cost per stage/month (only returned to project-financials viewers).
        const locked = await supabase.rpc("pm_project_stage_locked_cost", { p_project_id: projectId });
        const lockedBy = new Map<string, { snap: number; unsnap: number }>();
        for (const l of (locked.data ?? []) as Array<{ stage_id: string; month: string; snap_cost: number | string; unsnap_hours: number | string }>) {
          lockedBy.set(`${l.stage_id}:${l.month}`, { snap: Number(l.snap_cost) || 0, unsnap: Number(l.unsnap_hours) || 0 });
        }
        return (summary.data as Array<{
          stage_id: string;
          month: string;
          hours: number | string;
          billable_hours: number | string;
          non_billable_hours: number | string;
        }>).map((row) => {
          const hours = Number(row.hours) || 0;
          const lk = lockedBy.get(`${row.stage_id}:${row.month}`);
          return {
            stage_id: row.stage_id,
            month: row.month,
            hours,
            billableHours: Number(row.billable_hours) || 0,
            nonBillableHours: Number(row.non_billable_hours) || 0,
            snapCost: lk?.snap ?? 0,
            unsnapHours: lk ? lk.unsnap : hours,
          };
        });
      }
      const allocIds = data.stages.flatMap((s) =>
        s.allocations.map((a) => a.id),
      );

      // task ids belong to allocations
      const { data: tasks } = await supabase
        .from("pm_tasks")
        .select("id, allocation_id")
        .in("allocation_id", allocIds);
      const taskToAlloc = new Map<string, string>();
      const allocToStage = new Map<string, string>();
      for (const s of data.stages)
        for (const a of s.allocations) allocToStage.set(a.id, s.id);
      for (const t of tasks ?? []) taskToAlloc.set(t.id, t.allocation_id);
      const taskIds = (tasks ?? []).map((t) => t.id);
      const stageIds = data.stages.map((s) => s.id);
      const selectEntries = "id, task_id, pm_stage_id, entry_date, hours, billable, cost_rate_snapshot";
      const [taskEntryResult, directEntryResult] = await Promise.all([
        taskIds.length
          ? supabase
              .from("pm_time_entries")
              .select(selectEntries)
              .in("task_id", taskIds)
              .eq("entry_type", "project")
          : Promise.resolve({ data: [], error: null }),
        stageIds.length
          ? supabase
              .from("pm_time_entries")
              .select(selectEntries)
              .in("pm_stage_id", stageIds)
              .eq("entry_type", "project")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (taskEntryResult.error) throw taskEntryResult.error;
      if (directEntryResult.error) throw directEntryResult.error;
      const entries = Array.from(
        new Map(
          [...(taskEntryResult.data ?? []), ...(directEntryResult.data ?? [])].map((entry) => [entry.id, entry]),
        ).values(),
      );
      const byStage = new Map<
        string,
        { hours: number; billableHours: number; nonBillableHours: number; snapCost: number; unsnapHours: number }
      >();
      for (const e of (entries ?? []) as Array<{
        task_id: string | null;
        pm_stage_id: string | null;
        entry_date: string;
        hours: number;
        billable: boolean;
        cost_rate_snapshot: number | string | null;
      }>) {
        const allocId = e.task_id ? taskToAlloc.get(e.task_id) : undefined;
        const stageId = e.pm_stage_id ?? (allocId ? allocToStage.get(allocId) : undefined);
        if (!stageId) continue;
        const month = e.entry_date.slice(0, 7);
        const bucketKey = `${stageId}:${month}`;
        const h = Number(e.hours);
        const cur = byStage.get(bucketKey) ?? { hours: 0, billableHours: 0, nonBillableHours: 0, snapCost: 0, unsnapHours: 0 };
        cur.hours += h;
        // Locked cost rate per hour; hours without one fall back to current rates below.
        if (e.cost_rate_snapshot != null) cur.snapCost += h * Number(e.cost_rate_snapshot);
        else cur.unsnapHours += h;
        if (e.billable) cur.billableHours += h;
        else cur.nonBillableHours += h;
        byStage.set(bucketKey, cur);
      }
      return Array.from(byStage, ([bucketKey, v]) => {
        const separator = bucketKey.lastIndexOf(":");
        return {
          stage_id: bucketKey.slice(0, separator),
          month: bucketKey.slice(separator + 1),
          ...v,
        };
      });
    },
  });

  const { origin, totalDays } = useMemo(() => {
    if (!data?.stages.length) {
      const o = new Date();
      return { origin: addDays(o, -14), totalDays: 180 };
    }
    let minD = new Date(data.stages[0].start_date);
    let maxD = new Date(data.stages[0].end_date);
    for (const s of data.stages) {
      const sd = new Date(s.start_date);
      const ed = new Date(s.end_date);
      if (sd < minD) minD = sd;
      if (ed > maxD) maxD = ed;
    }
    const o = addDays(minD, -14);
    const days = Math.max(120, differenceInCalendarDays(maxD, o) + 90);
    return { origin: o, totalDays: days };
  }, [data]);

  const summaryLabel = t("projects:gantt.projectSummary");
  const { mappedStages, hierarchy } = useMemo(
    () =>
      data
        ? buildProjectGanttTree(data.stages, projectId, summaryLabel)
        : { mappedStages: [], hierarchy: new Map() },
    [data, projectId, summaryLabel],
  );

  // Payment milestones from issued invoices: read-only diamonds on the timeline.
  const ganttMilestones = useMemo<PaymentMilestone[]>(() => {
    const list = invoices ?? [];
    if (list.length === 0) return [];
    return list
      .filter((inv) => inv.raised_date)
      .map((inv) => ({
        id: inv.id,
        label: inv.invoice_number || inv.title || t("projects:detail.ui.invoice"),
        date: inv.raised_date,
        amount: Number(inv.total ?? 0),
        status:
          inv.status === "paid"
            ? ("paid" as const)
            : inv.status === "sent" || inv.status === "overdue"
              ? ("invoiced" as const)
              : ("planned" as const),
        note: inv.title ?? null,
      }));
  }, [invoices]);

  if (isLoading) {
    return (
      <AppShell active="projects">
        <div className="p-12 text-center text-sm text-muted-foreground">
           {t("projects:detail.ui.loading")} </div>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell active="projects">
        <div className="p-12 text-center text-sm text-destructive">
           {t("projects:detail.ui.loadError")} </div>
      </AppShell>
    );
  }

  const { project, stages } = data;

  // ---- Aggregations -----------------------------------------------------
  // Exclude retainer month children — their budget is already summed in the
  // retainer parent (kind='retainer_monthly'), so counting both double-counts.
  const totalBudget = stages.reduce(
    (sum, s) =>
      (s as { stage_kind?: string | null }).stage_kind === "retainer_month"
        ? sum
        : sum + Number(s.budget),
    0,
  );

  const stageCost = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return 0;
    return s.allocations.filter(a => !a.planning_removed_at).reduce(
      (acc, a) =>
        acc +
        allocationCost({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
          hourly_rate: effectiveCostRate(
            a.resource.cost_rate,
            a.resource.id,
            defaultRates,
            !!a.resource.hourly_rate_is_override,
          ),
        }),
      0,
    );
  };
  const stagePlannedHours = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return 0;
    const fromAllocs = s.allocations.filter(a => !a.planning_removed_at).reduce(
      (acc, a) =>
        acc +
        allocationHours({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
        }),
      0,
    );
    if (fromAllocs > 0) return fromAllocs;
    // Fallback — implied hours from quote-derived budget ÷ avg sale rate.
    // Mirrors the Financial Summary formula so the single-source Gantt
    // (quote stages) drives planned hours for fixed-fee work.
    const budget = Number(s.budget ?? 0);
    if (budget <= 0 || avgSaleRate <= 0) return 0;
    return budget / avgSaleRate;
  };
  const stageLoggedHours = (stageId: string) =>
    timeRows?.reduce((sum, r) => sum + (r.stage_id === stageId ? r.hours : 0), 0) ?? 0;
  const stageBillableHours = (stageId: string) =>
    timeRows?.reduce((sum, r) => sum + (r.stage_id === stageId ? r.billableHours : 0), 0) ?? 0;
  const stageNonBillableHours = (stageId: string) =>
    timeRows?.reduce((sum, r) => sum + (r.stage_id === stageId ? r.nonBillableHours : 0), 0) ?? 0;

  // Actuals follow the author, independently of bookings. Reconcile restricted
  // RLS coverage with existing privacy-safe totals; do not invent sale rates.
  const stageActuals = (stageId: string) => {
    const entries = (entryFiguresQ.data ?? []).filter(e => e.stageId === stageId);
    const logged = stageLoggedHours(stageId);
    const rawHours = entries.reduce((n,e) => n + e.hours, 0);
    const complete = Math.abs(logged - rawHours) < 0.005;
    const snapCost = timeRows?.reduce((n,r) => n + (r.stage_id === stageId ? r.snapCost : 0), 0) ?? 0;
    const missing = timeRows?.reduce((n,r) => n + (r.stage_id === stageId ? r.unsnapHours : 0), 0) ?? 0;
    const cost = complete ? entries.reduce((n,e) => n + e.cost,0) : missing === 0 ? snapCost : NaN;
    const revenue = complete ? entries.reduce((n,e) => n + e.value,0) : NaN;
    return { revenue, cost, profit: financialResult(revenue,cost).profit };
  };
  const stageActualRevenue = (stageId: string) => stageActuals(stageId).revenue;
  const stageActualCost = (stageId: string) => stageActuals(stageId).cost;

  const totalPlannedCost = stages.reduce((acc, s) => acc + stageCost(s.id), 0);
  const totalLoggedHours = stages.reduce(
    (acc, s) => acc + stageLoggedHours(s.id),
    0,
  );
  const totalPlannedHours = stages.reduce(
    (acc, s) => acc + stagePlannedHours(s.id),
    0,
  );
  const actuals = stages.reduce(
    (acc, s) => {
      const a = stageActuals(s.id);
      acc.revenue += a.revenue;
      acc.cost += a.cost;
      return acc;
    },
    { revenue: 0, cost: 0 },
  );
  // Imported historical entries (e.g. Accelo) are not bound to allocations,
  // so we add them at the project-total level only — never per-stage and never
  // into editable timesheets. Idempotency on (source_system, external_id)
  // prevents double counting on re-imports; live timesheet rows are never
  // mirrored into historical_time_entries, so the same hour cannot appear twice.
  const actualRevenue = actuals.revenue + hist.amount;
  const actualCost = actuals.cost + hist.cost + pursuit.cost;
  const actualProfit = actualRevenue - actualCost;
  const budgetUsedPct = totalBudget > 0 ? actualCost / totalBudget : 0;
  const budgetOver = actualCost > totalBudget && totalBudget > 0;

  // Invoiced total (excluding cancelled). This is a separate concept from
  // revenue — it's what has been BILLED to the client, not what has been earned.
  const invoicedTotal = (invoices ?? [])
    .filter((i) => ["sent", "paid", "overdue"].includes(i.status))
    .reduce((s, i) => s + Number(i.total ?? 0), 0);
  const invoicedPct = totalBudget > 0 ? invoicedTotal / totalBudget : 0;

  // Schedule range
  const scheduleStart = stages.length
    ? stages.reduce(
        (m, s) => (parseISO(s.start_date) < m ? parseISO(s.start_date) : m),
        parseISO(stages[0].start_date),
      )
    : parseISO(project.start_date);
  const scheduleEnd = stages.length
    ? stages.reduce(
        (m, s) => (parseISO(s.end_date) > m ? parseISO(s.end_date) : m),
        parseISO(stages[0].end_date),
      )
    : addDays(parseISO(project.start_date), 30);
  const today = new Date();
  const totalSpan = Math.max(
    1,
    differenceInCalendarDays(scheduleEnd, scheduleStart),
  );
  const elapsedDays = Math.max(
    0,
    Math.min(totalSpan, differenceInCalendarDays(today, scheduleStart)),
  );
  const remainingDays = Math.max(
    0,
    differenceInCalendarDays(scheduleEnd, today),
  );
  const overdueDays = today > scheduleEnd
    ? differenceInCalendarDays(today, scheduleEnd)
    : 0;

  // Team derived from unique allocated resources
  const team = Array.from(
    new Map(
      stages
        .flatMap((s) => s.allocations)
        .map((a) => [a.resource.id, a.resource]),
    ).values(),
  );

  // ---- Header status workflow ------------------------------------------
  const setStatus = (status: "active" | "paused" | "closing" | "archived") => {
    updateProject.mutate({ id: project.id, patch: { status } });
  };

  return (
    <AppShell active="projects">
      <div className="w-full px-3 pt-3 sm:px-5 2xl:px-10">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> {t("projects:detail.backToList")}
        </Link>

        {/* Header — single calm row: title + meta + status actions */}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          {/* LEFT: title + status */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <EditableProjectName
              name={project.name}
              readOnly={!canEditPlanning}
              onRename={(name) =>
                updateProject.mutateAsync({ id: project.id, patch: { name } })
              }
            />
            <StatusBadge status={project.status} />
            <ProjectSyncStatusBadge projectId={project.id} sourceQuoteId={sourceQuoteId} canEdit={isAdmin} />
          </div>

          {/* MIDDLE: contextual meta — client · dates · team */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="truncate">
              {project.client ?? t("projects:detail.header.noClient")}
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(scheduleStart, "d MMM", { locale: dateLocale })} – {format(scheduleEnd, "d MMM yyyy", { locale: dateLocale })}
              {overdueDays > 0 ? (
                <span className="font-medium text-destructive">· {t("common:duration.daysShort", { count: overdueDays })}</span>
              ) : (
                <span className="text-muted-foreground/70">· {t("common:duration.daysShort", { count: remainingDays })}</span>
              )}
            </span>
            {team.length > 0 && (
              <>
                <span className="text-border">·</span>
                <div className="flex -space-x-1.5">
                  {team.slice(0, 5).map((r) => (
                    <Link
                      key={r.id}
                      to="/projects/resources/$resourceId"
                      params={{ resourceId: r.id }}
                      title={r.name}
                      className="rounded-full ring-2 ring-background hover:z-10"
                    >
                      <CollaboratorAvatar
                        collaboratorId={(r as { collaborator_id?: string | null }).collaborator_id ?? null}
                        name={r.name}
                        color={r.color}
                        size={18}
                      />
                    </Link>
                  ))}
                  {team.length > 5 && (
                    <span className="inline-flex h-[18px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground ring-2 ring-background">
                      +{team.length - 5}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* RIGHT: primary status actions */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {isAdmin && <StatusToggle current={project.status} onChange={setStatus} />}
            <HardDeleteProjectButton projectId={project.id} />
          </div>
        </div>

        {/* Tab row — calmer, integrated with header (single bottom border) */}
        <div className="mt-2 flex items-center justify-between gap-2 border-b border-border">
          <div className="flex items-center gap-0 overflow-x-auto">
            {/* Tab IA per redesign: keep only Overview, Insights, Materials, Expenses, Billing.
                Schedule and Stream are deferred (code retained, hidden from nav).
                Rates / Assets / Attachments / Details are dropped. */}
            <TabBtn icon={ListChecks} label={t("projects:detail.tabs.overview")} active={tab === "overview"} onClick={() => setTab("overview")} />
            <TabBtn icon={TrendingUp} label={t("projects:detail.tabs.insights")} active={tab === "insights"} onClick={() => setTab("insights")} />
            <TabBtn icon={Repeat} label={t("projects:detail.ui.retainer")} active={tab === "ap"} onClick={() => setTab("ap")} />
            {isAdmin && (
              <TabBtn icon={CheckCircle2} label={t("projects:approvals.title")} active={tab === "approvals"} onClick={() => setTab("approvals")} />
            )}
            <TabBtn icon={FileText} label={t("projects:notes.tab")} active={tab === "notes"} onClick={() => setTab("notes")} />
            {/* Materials tab hidden — superseded by Suppliers tab. Data layer kept intact. */}
            <TabBtn icon={Receipt} label={t("projects:detail.tabs.expenses")} active={tab === "expenses"} onClick={() => setTab("expenses")} />
            {/* Billing and Financial tabs hidden per request — kept in code for quick re-enable. */}
            {projectFinanceAccess.hasAccess && <TabBtn icon={FileText} label={t('finance:projectBilling.title')} active={tab==='billing'} onClick={()=>setTab('billing')}/>}
            <TabBtn icon={Building2} label={t("projects:detail.ui.architecture")} active={tab === "architecture"} onClick={() => setTab("architecture")} />
            <TabBtn icon={UsersIcon} label={t("projects:detail.ui.suppliers")} active={tab === "consultants"} onClick={() => setTab("consultants")} />
            <TabBtn icon={ArrowDownToLine} label={t("projects:detail.ui.incoming")} active={tab === "incoming"} onClick={() => setTab("incoming")} />
            <TabBtn icon={ArrowUpFromLine} label={t("projects:detail.ui.outgoing")} active={tab === "outgoing"} onClick={() => setTab("outgoing")} />
            <TabBtn icon={CalendarClock} label={t("projects:detail.ui.paymentSchedule")} active={tab === "paymentSchedule"} onClick={() => setTab("paymentSchedule")} />
            <TabBtn icon={PieChartIcon} label={t("projects:detail.ui.financialSummary")} active={tab === "financialSummary"} onClick={() => setTab("financialSummary")} />
          </div>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="mb-1 hidden flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground lg:inline-flex"
            aria-label={sidebarOpen ? t("projects:detail.togglePanel.hide") : t("projects:detail.togglePanel.show")}
            title={sidebarOpen ? t("projects:detail.togglePanel.hide") : t("projects:detail.togglePanel.show")}
          >
            {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Body layout — collapsible left rail (240px) across all tabs, slim rail (44px) when collapsed. */}
        <div
          className={cn(
            "mt-3 grid gap-4",
            sidebarOpen
              ? "lg:grid-cols-[240px_minmax(0,1fr)]"
              : "lg:grid-cols-[44px_minmax(0,1fr)]",
          )}
        >
          <aside
            className={cn(
              "lg:sticky lg:top-4 lg:self-start",
              sidebarOpen
                ? "rounded-xl border border-border bg-card shadow-sm"
                : "hidden lg:flex lg:flex-col lg:items-center lg:gap-2 lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-1.5 lg:shadow-sm",
            )}
          >
            {sidebarOpen ? (
              <div className="space-y-5 p-4">
                <div className="-mt-1 mb-1 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("glossary:relation.client")}
                  </span>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    title={t("projects:detail.togglePanel.hide")}
                    aria-label={t("projects:detail.togglePanel.hide")}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ProjectClientField
                  projectId={project.id}
                  companyId={project.company_id}
                  client={project.client}
                />

                <SidebarSection title={t("projects:detail.sidebar.details")}>
                  <div className="space-y-1">
                    <DetailRow
                      label={t("common:status")}
                      value={t(`projects:detail.status.${project.status}`, { defaultValue: project.status })}
                    />
                    <DetailRow
                      label={t("projects:detail.ui.start")}
                      value={format(scheduleStart, "d MMM yyyy", { locale: dateLocale })}
                    />
                    <DetailRow
                      label={t("projects:detail.ui.end")}
                      value={format(scheduleEnd, "d MMM yyyy", { locale: dateLocale })}
                    />
                    <DetailRow
                      label={overdueDays > 0
                        ? t("projects:detail.ui.overdue")
                        : t("projects:detail.ui.remaining")}
                      value={t("common:duration.daysShort", { count: overdueDays > 0 ? overdueDays : remainingDays })}
                    />
                  </div>
                </SidebarSection>

                <SidebarSection title={t("projects:detail.sidebar.team")}>
                  <ProjectTeamCard
                    projectId={project.id}
                    resources={(resources ?? []).map((r) => ({
                      id: r.id,
                      name: r.name,
                      color: r.color,
                      collaborator_id: r.collaborator_id,
                    }))}
                    allocatedTeam={team.map((r) => ({
                      id: r.id,
                      name: r.name,
                      color: r.color,
                      collaborator_id: (r as { collaborator_id?: string | null }).collaborator_id ?? null,
                    }))}
                  />
                </SidebarSection>

                {canSeeFinancials && (
                  <>
                    <SidebarSection title={t("projects:detail.sidebar.budgetUsage")}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[11px]">
                          <span className={budgetOver ? "text-destructive font-semibold" : ""}>
                            {euros(actualCost)}
                          </span>
                          <span className="text-muted-foreground"> / {euros(totalBudget)}</span>
                        </span>
                        <span
                          className={cn(
                            "text-[10px]",
                            budgetOver ? "text-destructive font-medium" : "text-muted-foreground",
                          )}
                        >
                          {Math.round(budgetUsedPct * 100)}%
                        </span>
                      </div>
                      <Meter
                        value={Math.min(1, budgetUsedPct)}
                        tone={budgetOver ? "danger" : "ok"}
                        className="mt-2"
                      />
                    </SidebarSection>

                    <SidebarSection title={t("projects:detail.sidebar.profit")}>
                      <div className="flex items-baseline justify-between">
                        <span
                          className={cn(
                            "font-mono text-sm font-semibold",
                            actualProfit < 0 && "text-destructive",
                          )}
                        >
                          {euros(actualProfit)}
                        </span>
                        {totalBudget > 0 && (
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              actualProfit < 0 ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {Math.round((actualProfit / totalBudget) * 100)}%
                          </span>
                        )}
                      </div>
                    </SidebarSection>
                  </>
                )}

                {project.notes && (
                  <SidebarSection title={t("common:notes")}>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {project.notes}
                    </p>
                  </SidebarSection>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setSidebarOpen(true)}
                  title={t("projects:detail.togglePanel.show")}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={t("projects:detail.togglePanel.show")}
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setSidebarOpen(true)}
                  title={t("projects:detail.rail.teamTip", { count: team.length })}
                  aria-label={t("projects:detail.rail.teamTip", { count: team.length })}
                  className="flex flex-col items-center gap-0.5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground hover:bg-accent">
                    {team.length}
                  </span>
                  <span className="text-[8px] uppercase tracking-wide text-muted-foreground">{t("projects:detail.rail.team")}</span>
                </button>
                {canSeeFinancials && (
                  <>
                    <button
                      onClick={() => setSidebarOpen(true)}
                      title={t("projects:detail.rail.budgetTip", { pct: Math.round(budgetUsedPct * 100) })}
                      aria-label={t("projects:detail.rail.budgetTip", { pct: Math.round(budgetUsedPct * 100) })}
                      className="flex flex-col items-center gap-0.5"
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-[9px] font-mono font-medium hover:opacity-80",
                          budgetOver ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground",
                        )}
                      >
                        {Math.round(budgetUsedPct * 100)}%
                      </span>
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground">{t("projects:detail.rail.budget")}</span>
                    </button>
                    <button
                      onClick={() => setSidebarOpen(true)}
                      title={t("projects:detail.rail.profitTip", { amount: euros(actualProfit) })}
                      aria-label={t("projects:detail.rail.profitTip", { amount: euros(actualProfit) })}
                      className="flex flex-col items-center gap-0.5"
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-[9px] font-mono font-medium hover:opacity-80",
                          actualProfit < 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground",
                        )}
                      >
                        {totalBudget > 0 ? `${Math.round((actualProfit / totalBudget) * 100)}%` : "—"}
                      </span>
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground">{t("projects:detail.rail.profit")}</span>
                    </button>
                  </>
                )}
              </>
            )}
          </aside>


          {/* Main ------------------------------------------------------ */}
          <section>

            {tab === "overview" && (
              <div className="space-y-4">
                <CommercialBaselineCard projectId={projectId} />
                {/* Budget control moved to A&P tab */}



                <div className="rounded-lg border border-border bg-card">
                  <MilestonesTable
                    projectId={projectId}
                    stages={stages}
                    invoiced={invoicedTotal}
                    totalBudget={totalBudget}
                    stageCost={stageCost}
                    stageActualRevenue={stageActualRevenue}
                    stageActualCost={stageActualCost}
                    stageLoggedHours={stageLoggedHours}
                   stagePlannedHours={stagePlannedHours}
                    avgSaleRate={avgSaleRate}
                    defaultRates={defaultRates}
                    canSeeFinancials={canSeeFinancials}
                    onEditPlan={() => setTab("schedule")}
                    onOpenStageInsights={(stageId) => {
                      setInsightsScopeStageId(stageId);
                      setTab("insights");
                    }}
                  />

                </div>
                <ContractBaselineCard projectId={projectId} />
                <ContractDiffCard projectId={projectId} />
              </div>
            )}

            {tab === "ap" && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground"> {t("projects:detail.ui.retainers")} </h3>
                  <NewRetainerStageDialog
                    projectId={projectId}
                    nextOrder={stages.length}
                  />
                </div>
                <RetainerMonitorPanel
                  stages={stages}
                  byStage={budgetControl?.byStage}
                  showFinancials={canSeeFinancials}
                />

                {budgetControl && canSeeFinancials && (() => {
                  const archStages = stages.filter(
                    (s) => (s as { is_self?: boolean }).is_self !== false,
                  );
                  const archIds = new Set(archStages.map((s) => s.id));
                  const archByStage = new Map(
                    Array.from(budgetControl.byStage.entries()).filter(([id]) =>
                      archIds.has(id),
                    ),
                  );
                  const entries = Array.from(archByStage.values());
                  const sum = (k: keyof typeof entries[number]) =>
                    entries.reduce((a, e) => a + (Number(e[k] as number) || 0), 0);
                  const actualHours = sum("actual_hours_logged");
                  const actualCost = sum("actual_cost_consumed");
                  const teamRated = entries.filter((e) => e.has_team_rate);
                  const avgRate = teamRated.length
                    ? teamRated.reduce(
                        (a, e) => a + e.average_team_hourly_rate * e.actual_hours_logged,
                        0,
                      ) / Math.max(1, teamRated.reduce((a, e) => a + e.actual_hours_logged, 0)) ||
                      teamRated.reduce((a, e) => a + e.average_team_hourly_rate, 0) /
                        teamRated.length
                    : 0;
                  const remaining = sum("remaining_budget");
                  const plannedCost = sum("planned_future_cost");
                  const plannedHours = sum("planned_future_hours");
                  const archProject = {
                    ...budgetControl.project,
                    actual_hours_logged: actualHours,
                    actual_billable_hours: sum("actual_billable_hours"),
                    actual_non_billable_hours: sum("actual_non_billable_hours"),
                    actual_cost_consumed: actualCost,
                    actual_value_generated: sum("actual_value_generated"),
                    original_budget: sum("original_budget"),
                    remaining_budget: remaining,
                    planned_future_hours: plannedHours,
                    planned_future_cost: plannedCost,
                    projected_over_under: remaining - plannedCost,
                    average_team_hourly_rate: avgRate,
                    has_team_rate: teamRated.length > 0,
                    estimated_available_hours:
                      teamRated.length > 0 && avgRate > 0 ? remaining / avgRate : null,
                  };
                  return (
                    <BudgetControlPanel
                      project={archProject}
                      byStage={archByStage}
                      stages={archStages.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
                      showFinancials={canSeeFinancials}
                    />
                  );
                })()}
                {/* Forecast & coverage card hidden per request. Re-enable: <ProjectForecastCard projectId={projectId} /> */}
              </div>
            )}

            {/* Materials tab content hidden — see Suppliers tab. Kept for quick re-enable.
            {tab === "materials" && (
              <div className="mt-4">
                <ExternalServicesSection projectId={projectId} canEdit={isAdmin && canSeeFinancials} />
              </div>
            )} */}


            {tab === "expenses" && (
              <div className="mt-4">
                <ProjectExpensesSection
                  projectId={projectId}
                  canEdit={isAdmin || !!isAssignedToProject}
                  privileged={isAdmin || canV2("projects.view_financials", "all")}
                />
              </div>
            )}

            {tab === "rates" && (
              <div className="mt-4">
                <PlaceholderPanel
                  icon={DollarSign}
                  title={t("projects:detail.placeholder.ratesTitle")}
                  description={t("projects:detail.placeholder.ratesDescription")}
                  badge={t("projects:detail.placeholder.comingSoon")}
                />
              </div>
            )}

            {tab === "billing" && projectFinanceAccess.hasAccess && (
              <div className="mt-4">
                <ProjectBillingTab projectId={projectId} />
              </div>
            )}

            {tab === "financial" && (
              <div className="mt-4">
                <ProjectFinancialTab projectId={projectId} />
              </div>
            )}


            {tab === "architecture" && (
              <div className="mt-4 space-y-4">
                {sourceQuoteId ? (
                  <>
                    <QuotePaymentScheduleTab quoteId={sourceQuoteId} compositionOnly />
                    <ArchitectureFinancialBreakdown quoteId={sourceQuoteId} />
                  </>
                ) : (
                  <NoQuoteLinkedPlaceholder label={t("projects:detail.ui.architecture")} projectId={projectId} />
                )}
              </div>
            )}
            {tab === "consultants" && (
              <div className="mt-4">
                {sourceQuoteId ? (
                  <QuotePaymentScheduleTab quoteId={sourceQuoteId} consultantsOnly />
                ) : (
                  <NoQuoteLinkedPlaceholder label={t("projects:detail.ui.suppliers")} projectId={projectId} />
                )}
              </div>
            )}
            {tab === "incoming" && (
              <div className="mt-4">
                {sourceQuoteId ? (
                  <QuotePaymentScheduleTab quoteId={sourceQuoteId} incomingOnly />
                ) : (
                  <NoQuoteLinkedPlaceholder label={t("projects:detail.ui.incoming")} projectId={projectId} />
                )}
                <div className="mt-4"><PaymentsReceived projectId={projectId} /></div>
              </div>
            )}
            {tab === "outgoing" && (
              <div className="mt-4">
                {sourceQuoteId ? (
                  <QuotePaymentScheduleTab quoteId={sourceQuoteId} outgoingOnly />
                ) : (
                  <NoQuoteLinkedPlaceholder label={t("projects:detail.ui.outgoing")} projectId={projectId} />
                )}
              </div>
            )}
            {tab === "paymentSchedule" && (
              <div className="mt-4">
                {sourceQuoteId ? (
                  <QuotePaymentScheduleTab quoteId={sourceQuoteId} />
                ) : (
                  <NoQuoteLinkedPlaceholder label={t("projects:detail.ui.paymentSchedule")} projectId={projectId} />
                )}
              </div>
            )}
            {tab === "financialSummary" && (
              <div className="mt-4">
                {sourceQuoteId ? (
                  <QuoteFinancialSummaryTab quoteId={sourceQuoteId} pricingMultiplier={baselineMultiplier} />
                ) : (
                  <NoQuoteLinkedPlaceholder label={t("projects:detail.ui.financialSummary")} projectId={projectId} />
                )}
              </div>
            )}

            {tab === "schedule" && (
              <div className="mt-4 space-y-3">
                {sourceQuoteId ? (
                  <QuotePlanningTab quoteId={sourceQuoteId} pricingMultiplier={baselineMultiplier} />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={showCancelled}
                          onChange={(e) => setShowCancelled(e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        {t("projects:gantt.showCancelled")}
                      </label>
                    </div>
                    <ProjectGantt
                      projectId={project.id}
                      showCancelled={showCancelled}
                      canEdit={canEditPlanning}
                      canSeeFinancials={canSeeFinancials}
                    />
                  </>
                )}
              </div>
            )}

            {tab === "approvals" && isAdmin && (
              <div className="mt-4">
                <ApprovalsPanel projectId={projectId} />
              </div>
            )}

            {tab === "notes" && (
              <ProjectNotesTab projectId={projectId} />
            )}






            {tab === "insights" && canSeeFinancials && (
              <div className="mt-4">
                <ProjectPursuitCard
                  projectId={projectId}
                  opportunityId={(data?.project as { opportunity_id?: string | null } | undefined)?.opportunity_id ?? null}
                  hours={pursuit.hours}
                  cost={pursuit.cost}
                />
              </div>
            )}
            {tab === "insights" && (
              <InsightsPanel
                projectId={projectId}
                canEdit={isAdmin && canSeeFinancials}
                stages={stages}
                invoices={invoices ?? []}
                invoicedTotal={invoicedTotal}
                totalBudget={totalBudget}
                totalPlannedCost={totalPlannedCost}
                actualRevenue={actualRevenue}
                actualCost={actualCost}
                actualProfit={actualProfit}
                totalLoggedHours={totalLoggedHours}
                totalPlannedHours={totalPlannedHours}
                stageLoggedHours={stageLoggedHours}
                stageBillableHours={stageBillableHours}
                stageNonBillableHours={stageNonBillableHours}
                stagePlannedHours={stagePlannedHours}
                stageCost={stageCost}
                stageActuals={stageActuals}
                defaultRates={defaultRates}
                activities={activities ?? []}
                timeRows={timeRows ?? []}
                      entryFigures={entryFiguresQ.data ?? []}
                historical={hist}
                initialScopeStageId={insightsScopeStageId}
              />
            )}

            {tab === "stream" && (
              <div className="mt-4 space-y-3">
                {(activities ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                     {t("projects:detail.ui.noActivity")} </div>
                ) : (
                  (activities ?? []).map((a) => (
                    <article
                      key={a.id}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <header className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          {a.author && (
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: a.author.color }}
                            />
                          )}
                          <span className="font-medium text-foreground">
                            {a.author?.name ?? t("common:system")}
                          </span>
                          {a.stage && <span>· {a.stage.name}</span>}
                        </div>
                        <time>
                          {format(parseISO(a.created_at), "d MMM, HH:mm", {
                            locale: dateLocale,
                          })}
                        </time>
                      </header>
                      <h3 className="mt-1 text-sm font-semibold">{a.title}</h3>
                      {a.body && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">
                          {a.body}
                        </p>
                      )}
                      {a.logged_hours > 0 && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> {a.logged_hours} {t("common:units.hoursShort")} </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

// ===== Subcomponents =====================================================

function EditableProjectName({
  name,
  onRename,
  readOnly = false,
}: {
  name: string;
  onRename: (next: string) => Promise<unknown>;
  readOnly?: boolean;
}) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setValue(name);
      setEditing(false);
      return;
    }
    try {
      setSaving(true);
      await onRename(trimmed);
      setEditing(false);
    } catch {
      setValue(name);
    } finally {
      setSaving(false);
    }
  };

  if (editing && !readOnly) {
    return (
      <input
        autoFocus
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-0.5 text-3xl font-semibold tracking-tight text-foreground focus:border-primary focus:outline-none"
      />
    );
  }

  return (
    <h1
      onDoubleClick={() => {
        if (readOnly) return;
        setValue(name);
        setEditing(true);
      }}
      title={readOnly ? undefined : t("projects:detail.ui.renameHint")}
      className={cn(
        "truncate text-3xl font-semibold tracking-tight",
        readOnly ? "cursor-default" : "cursor-text",
      )}
    >
      {name}
    </h1>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const tone =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "paused"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : status === "closing"
          ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
          : "bg-muted text-muted-foreground";
  const label =
    status === "active"
      ? t("projects:detail.status.active")
      : status === "paused"
        ? t("projects:detail.status.paused")
        : status === "closing"
          ? t("projects:detail.status.closing")
          : t("projects:detail.status.archived");
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider", tone)}>
      {label}
    </span>
  );
}

function StatusToggle({
  current,
  onChange,
}: {
  current: string;
  onChange: (s: "active" | "paused" | "closing" | "archived") => void;
}) {

  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      <Button
        size="sm"
        variant={current === "active" ? "default" : "ghost"}
        className="h-8 gap-1.5 text-xs"
        onClick={() => onChange("active")}
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> {t("projects:detail.actions.activate")}
      </Button>
      <Button
        size="sm"
        variant={current === "paused" ? "default" : "ghost"}
        className="h-8 gap-1.5 text-xs"
        onClick={() => onChange("paused")}
      >
        <Pause className="h-3.5 w-3.5" /> {t("projects:detail.actions.pause")}
      </Button>
      <Button
        size="sm"
        variant={current === "closing" ? "default" : "ghost"}
        className="h-8 gap-1.5 text-xs"
        onClick={() => onChange("closing")}
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> {t("projects:detail.actions.close")}
      </Button>

      <Button
        size="sm"
        variant={current === "archived" ? "default" : "ghost"}
        className="h-8 gap-1.5 text-xs"
        onClick={() => onChange("archived")}
      >
        <XCircle className="h-3.5 w-3.5" /> {t("projects:detail.actions.archive")}
      </Button>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border pb-5 last:border-b-0">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right font-medium truncate">{value}</span>
    </div>
  );
}

function Meter({
  value,
  tone,
  className,
}: {
  value: number;
  tone: "ok" | "danger" | "info";
  className?: string;
}) {
  const colorVar =
    tone === "danger"
      ? "var(--color-budget-over)"
      : tone === "info"
        ? "var(--primary)"
        : "var(--color-budget-spent)";
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, backgroundColor: colorVar }}
      />
    </div>
  );
}

function DateChip({
  label,
  date,
  highlight,
}: {
  label: string;
  date: Date;
  highlight?: boolean;
}) {
  const dateLocale = useDateLocale();
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className={cn(
          "flex h-10 w-10 flex-col items-center justify-center rounded-md border text-center leading-none",
          highlight ? "border-primary bg-primary/5" : "border-border bg-background",
        )}
      >
        <span className="text-[11px] font-semibold">
          {format(date, "dd")}
        </span>
        <span className="text-[9px] uppercase text-muted-foreground">
          {format(date, "MMM", { locale: dateLocale })}
        </span>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
          {label}
        </div>
        <div className="font-medium">
          {format(date, "d MMMM yyyy", { locale: dateLocale })}
        </div>
      </div>
    </div>
  );
}

function PlaceholderPanel({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <Badge variant="secondary" className="mt-4">{badge}</Badge>
      <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function TabBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[12px] border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function NoQuoteLinkedPlaceholder({ label, projectId }: { label: string; projectId?: string }) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  const qc = (typeof window !== "undefined") ? undefined : undefined; // placeholder to avoid hook order
  const [busy, setBusy] = useState(false);
  const handleBackfill = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("ensure_project_has_quote", { _project_id: projectId });
      if (error) throw error;
      toast.success(t("projects:detail.ui.quoteCreated", { id: String(data).slice(0, 8) }));
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
    void qc;
  };
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center">
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">
         {t("projects:detail.ui.noQuote")} </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
         {t("projects:detail.ui.createQuoteHint")} </div>
      {projectId && (
        <button
          type="button"
          onClick={handleBackfill}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? t("common:creating") : t("projects:detail.ui.createQuote")}
        </button>
      )}
    </div>
  );
}


function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function MilestonesTable({
  projectId,
  stages,
  stageCost,
  stageActualRevenue,
  stageActualCost,
  stageLoggedHours,
  stagePlannedHours,
  avgSaleRate,
  defaultRates,
  canSeeFinancials,
  onEditPlan,
  onOpenStageInsights,
}: {
  projectId: string;
  stages: ReturnType<typeof useProjectDetail>["data"] extends infer T
    ? T extends { stages: infer S }
      ? S
      : never
    : never;
  invoiced: number;
  totalBudget: number;
  stageCost: (id: string) => number;
  stageActualRevenue: (id: string) => number;
  stageActualCost: (id: string) => number;
  stageLoggedHours: (id: string) => number;
  stagePlannedHours: (id: string) => number;
  avgSaleRate: number;
  defaultRates: ReturnType<typeof useDefaultResourceRates>["data"];
  canSeeFinancials: boolean;
  onEditPlan?: () => void;
  onOpenStageInsights?: (stageId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(stages?.map((s) => s.id) ?? []),
  );
  const { t } = useTranslation("projects");
  const finance = useFinanceAccess();
  const billed = useStageBilled(projectId,finance.hasAccess && canSeeFinancials);
  const allocKey = `psa.resumo.allocOpen.${projectId}`;
  const [allocOpen, setAllocOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(allocKey);
      setAllocOpen(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setAllocOpen(new Set());
    }
  }, [allocKey]);
  const toggleAlloc = (id: string) =>
    setAllocOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(allocKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "empty">("all");
  const [search, setSearch] = useState("");
  const allocationIds = (stages ?? []).flatMap((s) => s.allocations.map((a) => a.id));
  const { data: taskNames = {} } = useAllocationTaskNames(allocationIds);
  const { data: targetMargins } = useStageTargetMargins(projectId);
  // Task being edited (double-click / kebab) — same dialog as Add task.
  const [editingTask, setEditingTask] = useState<{
    allocationId: string;
    stageId: string;
  } | null>(null);

  /**
   * Derived stage envelope: capacity hours, allocated planned hours/cost and
   * the projected margin against the stage sale value. Nothing stored.
   */
  const envelopeFor = (s: { id: string; budget: number | string; baseline_target_hours?: number | null; allocations: unknown[] }) =>
    computeStageEnvelope({
      saleValue: Number(s.budget ?? 0),
      baselineTargetHours: (s as { baseline_target_hours?: number | null }).baseline_target_hours ?? null,
      avgSaleRate,
      allocations: s.allocations as EnvelopeAllocation[],
      defaultRates,
      targetMargin: resolveTargetMargin(targetMargins, s.id),
    });

  const dialogStage = (s: {
    id: string;
    name: string;
    budget: number | string;
    start_date: string;
    end_date: string;
    allocations: unknown[];
  }) => ({
    id: s.id,
    name: s.name,
    budget: s.budget,
    baseline_target_hours:
      (s as { baseline_target_hours?: number | null }).baseline_target_hours ?? null,
    start_date: s.start_date,
    end_date: s.end_date,
    allocations: s.allocations as EnvelopeAllocation[],
  });


  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allExpanded = stages.every((s) => expanded.has(s.id));
  const toggleAll = () => {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(stages.map((s) => s.id)));
  };

  const filtered = stages.filter((s) => {
    // Show only our own stages here — supplier-owned stages live in their
    // own breakdowns under Consultants/Outgoing.
    if ((s as { is_self?: boolean }).is_self === false) return false;
    if (statusFilter === "active" && s.allocations.length === 0) return false;
    if (statusFilter === "empty" && s.allocations.length > 0) return false;
    if (search) {
      const q = search.toLowerCase();
      const inName = s.name.toLowerCase().includes(q);
      const inAllocs = s.allocations.some((a) =>
        a.resource.name.toLowerCase().includes(q),
      );
      if (!inName && !inAllocs) return false;
    }
    return true;
  });

  if (!stages || stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground">
        <span> {t("projects:detail.ui.addStageHint")} </span>
        {onEditPlan && (
          <button
            onClick={onEditPlan}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />  {t("projects:detail.actions.addStage")} </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={allExpanded ? t("common:collapseAll") : t("common:expandAll")}
            title={allExpanded ? t("common:collapseAll") : t("common:expandAll")}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            <span className="text-foreground/80"> {t("common:status")} </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "empty")}
              className="bg-transparent text-xs font-medium text-foreground outline-none"
            >
              <option value="all"> {t("common:all")} </option>
              <option value="active"> {t("common:active")} </option>
              <option value="empty">{t("projects:detail.ui.noAllocation")}</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEditPlan}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" />  {t("projects:detail.ui.editPlan")} </button>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent">
            <Plus className="h-3.5 w-3.5" />  {t("projects:detail.ui.addTask")} </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common:search")}
              className="h-8 w-44 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <p className="border-b border-border px-4 py-1.5 text-[11px] text-muted-foreground">
        {t("detail.resumo.legend.actual")} · <span className="italic">{t("detail.resumo.legend.planned")}</span> · {t("detail.resumo.legend.zero")}
      </p>
      {/* Table */}
      <div className="max-h-[75vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_var(--border)]">
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-30 bg-card px-4 py-2.5 font-semibold"> {t("projects:detail.ui.milestonesTasks")} </th>
              <th className="px-4 py-2.5 font-semibold"> {t("common:status")} </th>
              {canSeeFinancials && (
                <>
                  <th
                    className="px-4 py-2.5 text-right font-semibold"
                    title={t("projects:detail.ui.actualCostHint")}
                  >
                     {t("projects:detail.ui.actualCost")} </th>
                  <th
                    className="px-4 py-2.5 text-right font-semibold"
                    title={t("projects:detail.ui.earnedRevenueHint")}
                  >
                     {t("projects:detail.ui.earnedRevenue")} </th>
                  {finance.hasAccess && <><th className="px-4 py-2.5 text-right font-semibold">{t('finance:provisional.billedNet')}</th><th className="px-4 py-2.5 text-right font-semibold">{t('finance:provisional.earnedDifference')}</th></>}
                  <th
                    className="px-4 py-2.5 text-right font-semibold"
                    title={t("projects:detail.ui.profitHint")}
                  >
                     {t("projects:detail.ui.profitMargin")} </th>
                </>
              )}
              <th className="px-4 py-2.5 text-right font-semibold"> {t("projects:detail.ui.usedPlannedHours")} </th>
              <th className="px-4 py-2.5 font-semibold"> {t("projects:detail.ui.scheduledStart")} </th>
              <th className="px-4 py-2.5 font-semibold"> {t("projects:detail.ui.scheduledDue")} </th>
              <th className="px-4 py-2.5 text-right font-semibold"> {t("common:actions")} </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Build a tree from the filtered (is_self) stages so parent
              // stages render as section headers with children indented.
              // A stage is a "root" when its parent_stage_id is null or its
              // parent isn't in the filtered set (e.g. the parent is the
              // supplier-level "Architecture" row that we hide).
              type Row = (typeof filtered)[number];
              const inSet = new Set(filtered.map((s) => s.id));
              const childrenOf = new Map<string | null, Row[]>();
              for (const s of filtered) {
                const pid = (s as { parent_stage_id?: string | null }).parent_stage_id ?? null;
                const key = pid && inSet.has(pid) ? pid : null;
                const arr = childrenOf.get(key) ?? [];
                arr.push(s);
                childrenOf.set(key, arr);
              }
              // Stable sort children by sort_order then name.
              for (const arr of childrenOf.values()) {
                arr.sort((a, b) => {
                  const ao = Number((a as { sort_order?: number }).sort_order ?? 0);
                  const bo = Number((b as { sort_order?: number }).sort_order ?? 0);
                  if (ao !== bo) return ao - bo;
                  return a.name.localeCompare(b.name);
                });
              }

              const descendantsOf = (id: string): Row[] => {
                const out: Row[] = [];
                const stack = [...(childrenOf.get(id) ?? [])];
                while (stack.length) {
                  const r = stack.pop()!;
                  out.push(r);
                  for (const c of childrenOf.get(r.id) ?? []) stack.push(c);
                }
                return out;
              };

              const aggBudget = (s: Row): number => {
                const own = Number(s.budget) || 0;
                const desc = descendantsOf(s.id).reduce(
                  (acc, d) => acc + (Number(d.budget) || 0),
                  0,
                );
                return own + desc;
              };
              const aggCost = (s: Row): number =>
                stageActualCost(s.id) +
                descendantsOf(s.id).reduce((acc, d) => acc + stageActualCost(d.id), 0);
              const aggRevenue = (s: Row): number =>
                stageActualRevenue(s.id) +
                descendantsOf(s.id).reduce((acc, d) => acc + stageActualRevenue(d.id), 0);
              const aggLogged = (s: Row): number =>
                stageLoggedHours(s.id) +
                descendantsOf(s.id).reduce((acc, d) => acc + stageLoggedHours(d.id), 0);
              const aggPlanned = (s: Row): number =>
                stagePlannedHours(s.id) +
                descendantsOf(s.id).reduce((acc, d) => acc + stagePlannedHours(d.id), 0);

              const rows: ReactElement[] = [];

              const renderStage = (s: Row, depth: number, label: string) => {
                const hasChildren = (childrenOf.get(s.id) ?? []).length > 0;
                const isOpen = expanded.has(s.id);
                const isActive = s.allocations.length > 0;
                const budget = hasChildren ? aggBudget(s) : Number(s.budget) || 0;
                const cost = hasChildren ? aggCost(s) : stageActualCost(s.id);
                const revenue = hasChildren ? aggRevenue(s) : stageActualRevenue(s.id);
                const logged = hasChildren ? aggLogged(s) : stageLoggedHours(s.id);
                const planned = hasChildren ? aggPlanned(s) : stagePlannedHours(s.id);
                const over = cost > budget && budget > 0;
                const level: 1 | 2 | 3 = depth === 0 ? 1 : hasChildren ? 2 : 3;
                const allocsOpen = allocOpen.has(s.id);
                const env = !hasChildren ? envelopeFor(s) : null;
                const stickyBg =
                  level === 1 ? "bg-[color-mix(in_oklab,var(--muted)_45%,var(--card))]" : "bg-card";

                rows.push(
                  <Fragment key={s.id}>
                    <tr
                      className={
                        level === 1
                          ? "border-b border-border bg-[color-mix(in_oklab,var(--muted)_45%,var(--card))]"
                          : "border-b border-border hover:bg-muted/20"
                      }
                    >
                      <td className={cn("sticky left-0 z-10 px-4 py-3", stickyBg)}>
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingLeft: depth * 20 }}
                        >
                          {hasChildren || s.allocations.length > 0 ? (
                            <button
                              onClick={() => (hasChildren ? toggle(s.id) : toggleAlloc(s.id))}
                              className="text-muted-foreground hover:text-foreground"
                              aria-expanded={hasChildren ? isOpen : allocsOpen}
                              aria-label={
                                hasChildren
                                  ? isOpen ? t("common:collapse") : t("common:expand")
                                  : t(allocsOpen ? "detail.resumo.hideAllocations" : "detail.resumo.showAllocations")
                              }
                            >
                              {(hasChildren ? isOpen : allocsOpen) ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block h-3.5 w-3.5" />
                          )}
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onOpenStageInsights?.(s.id)}
                              className={cn(
                                "truncate text-left text-foreground hover:underline",
                                level === 1 && "text-[15px] font-bold",
                                level === 2 && "font-semibold",
                              )}
                              title={t("projects:detail.ui.stageInsights")}
                            >
                              {label}. {s.name}
                            </button>

                            {hasChildren ? (
                              <div className="text-[11px] text-muted-foreground">
                                {t("projects:detail.ui.subStages", { count: (childrenOf.get(s.id) ?? []).length })}
                              </div>
                            ) : (
                              <StageDetailLine env={env!} allocations={s.allocations.length} showFinancials={canSeeFinancials} />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StageStatusCell
                          stageId={s.id}
                          projectId={projectId}
                          status={normalizeStageStatus((s as { status?: string }).status)}
                        />
                      </td>
                      {canSeeFinancials && (
                        <>
                          <td className="px-4 py-3 min-w-[200px] w-[18%] text-right">
                            <CostVsBudgetCell
                              cost={cost}
                              budget={budget}
                              over={over}
                              isHourly={
                                (s as { billing_model?: string | null }).billing_model === "hourly"
                              }
                              revenue={revenue}
                            />

                          </td>
                          <td className="px-4 py-3 min-w-[140px] w-[13%] text-right">
                            <RevenueEarnedCell revenue={revenue} />
                          </td>
                          {finance.hasAccess && <><td className="px-4 py-3 text-right tabular-nums">{billed.isError || !billed.data ? '—' : fmtEur([s.id,...descendantsOf(s.id).map(d=>d.id)].reduce((sum,id)=>sum+(billed.data?.get(id)??0),0))}</td><td className="px-4 py-3 text-right tabular-nums">{billed.isError || !billed.data ? '—' : fmtEur(revenue-[s.id,...descendantsOf(s.id).map(d=>d.id)].reduce((sum,id)=>sum+(billed.data?.get(id)??0),0))}</td></>}
                          <td className="px-4 py-3 min-w-[140px] w-[13%] text-right">
                            <ProfitMarginCell revenue={revenue} cost={cost} />
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <UsageBudgetCell logged={logged} planned={planned} over={over} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <DateLink date={parseISO(s.start_date)} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <DateLink date={parseISO(s.end_date)} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StageRowActions
                          stageId={s.id}
                          projectId={projectId}
                          status={normalizeStageStatus((s as { status?: string }).status)}
                          startDate={s.start_date}
                          endDate={s.end_date}
                          stageName={s.name}
                          assignedResourceIds={s.allocations.map((a) => a.resource.id)}
                          stage={dialogStage(s)}
                          isSupplier={(s as { is_self?: boolean | null }).is_self === false}

                          onEdit={onEditPlan}
                        />
                      </td>
                    </tr>

                    {allocsOpen && !hasChildren &&
                      s.allocations.map((a) => {
                        const aHours =
                          allocationHours(a);
                        const aPlannedCost =
                          aHours *
                          effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override);
                        const aPlannedRevenue =
                          aHours *
                          effectiveSaleRate(a.resource.hourly_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override);
                        return (
                          <tr
                            key={a.id}
                            className="h-10 border-b border-border text-xs text-muted-foreground last:border-b-0"
                            onDoubleClick={() =>
                              setEditingTask({ allocationId: a.id, stageId: s.id })
                            }
                            title={t("projects:detail.ui.taskEditHint")}
                          >
                            <td className="sticky left-0 z-10 bg-card px-4 py-1">
                              <div
                                className="flex items-center gap-2"
                                style={{ paddingLeft: (depth + 1) * 20 + 24 }}
                              >
                                <CollaboratorAvatar
                                  collaboratorId={(a.resource as { collaborator_id?: string | null }).collaborator_id ?? null}
                                  name={a.resource.name}
                                  color={a.resource.color}
                                  size={18}
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-foreground/80">
                                    {taskNames[a.id] ?? a.resource.name}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {a.resource.name} · {Number(a.hours_per_day)} {t("common:units.hoursPerDay")} ·  {" "}
                                    {formatNumber(aHours, 1)} {t("common:units.hoursShort")} {canSeeFinancials ? t("projects:detail.ui.costValue", { value: euros(aPlannedCost) }) : ""}
                                  </div>
                                </div>

                              </div>
                            </td>
                            <td className="px-4 py-1">
                              <StatusDot active label={t("projects:detail.resumo.plannedTip")} dotOnly />
                            </td>
                            {canSeeFinancials && (
                              <>
                                <td className="px-4 py-1 text-right min-w-[200px]" title={t("projects:detail.ui.plannedCostHint")}>
                                  <PlannedAmountCell amount={aPlannedCost} label={t("projects:detail.resumo.plannedTip")} />
                                </td>
                                <td className="px-4 py-1 text-right min-w-[160px]" title={t("projects:detail.ui.plannedRevenueHint")}>
                                  <PlannedAmountCell amount={aPlannedRevenue} label={t("projects:detail.resumo.plannedTip")} />
                                </td>
                                {finance.hasAccess && <><td className="px-4 py-1 text-right">—</td><td className="px-4 py-1 text-right">—</td></>}
                                <td className="px-4 py-1 text-right min-w-[160px]" title={t("projects:detail.ui.plannedProfitHint")}>
                                  <PlannedAmountCell amount={aPlannedRevenue - aPlannedCost} label={t("projects:detail.resumo.plannedTip")} />
                                </td>
                              </>
                            )}
                            <td className="px-4 py-1 whitespace-nowrap text-right">
                              <UsageBudgetCell logged={0} planned={aHours} over={false} />
                            </td>
                            <td className="px-4 py-1 whitespace-nowrap">
                              <DateLink date={parseISO(a.start_date)} />
                            </td>
                            <td className="px-4 py-1 whitespace-nowrap">
                              <DateLink date={parseISO(a.end_date)} />
                            </td>
                            <td className="px-4 py-1 text-right">
                              <AllocationRowActions
                                allocationId={a.id}
                                projectId={projectId}
                                resourceName={a.resource?.name}
                                onEdit={onEditPlan}
                                onEditTask={() =>
                                  setEditingTask({ allocationId: a.id, stageId: s.id })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                  </Fragment>,
                );

                if (isOpen && hasChildren) {
                  const kids = childrenOf.get(s.id) ?? [];
                  kids.forEach((c, idx) => renderStage(c, depth + 1, `${label}.${idx + 1}`));
                }
              };

              const roots = childrenOf.get(null) ?? [];
              roots.forEach((r, idx) => renderStage(r, 0, String(idx + 1)));

              return rows;
            })()}
          </tbody>
        </table>
      </div>

      {editingTask && (() => {
        const st = stages.find((x) => x.id === editingTask.stageId);
        if (!st) return null;
        return (
          <CreateStageTaskDialog
            open
            onOpenChange={(v) => {
              if (!v) setEditingTask(null);
            }}
            stageId={st.id}
            projectId={projectId}
            stageName={st.name}
            stageStart={st.start_date}
            stageEnd={st.end_date}
            stage={dialogStage(st)}
            allocationId={editingTask.allocationId}
          />
        );
      })()}
    </div>
  );
}

/**
 * Derived capacity chip on a stage row: allocated vs. capacity hours for
 * everyone, planned cost against target cost and projected margin for
 * management. Planned allocation only — not logged time.
 */
function StageEnvelopeChip({
  env,
  showFinancials,
}: {
  env: ReturnType<typeof computeStageEnvelope>;
  showFinancials: boolean;
}) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  if (env.capacityHours <= 0 && env.before.allocatedHours <= 0) return null;
  const usedPct =
    env.capacityHours > 0
      ? Math.min(1, env.before.allocatedHours / env.capacityHours)
      : 1;
  const overHours = env.capacityHours > 0 && env.before.allocatedHours > env.capacityHours;
  const marginBelow =
    env.before.projectedMargin != null && env.before.projectedMargin < env.targetMargin;
  return (
    <div className="mt-1 max-w-[260px] space-y-1">
      <div className="text-[10px] text-muted-foreground">
        {t("projects:detail.ui.allocatedCapacity", { allocated: formatNumber(env.before.allocatedHours, 1), capacity: formatNumber(env.capacityHours, 1) })}{" "}
        <span className={overHours ? "text-destructive" : ""}>
          {t("projects:detail.ui.remainingHours", { hours: formatNumber(env.before.remainingHours, 1) })}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={overHours ? "h-full bg-destructive" : "h-full bg-foreground/50"}
          style={{ width: `${usedPct * 100}%` }}
        />
      </div>
      {showFinancials && env.saleValue > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {euros(env.before.plannedCost)} / {euros(env.targetCost)} {t("projects:detail.ui.plannedCostLabel")}{" "}
          <span className={marginBelow ? "text-destructive" : ""}>
            {env.before.projectedMargin == null
              ? "—"
              : t("projects:detail.ui.marginValue", { value: formatNumber(Math.round(env.before.projectedMargin * 100)) })}
          </span>
        </div>
      )}
    </div>
  );
}

/** One-line stage summary; capacity / planned cost / margin in a tooltip. */
function StageDetailLine({
  env,
  allocations,
  showFinancials,
}: {
  env: ReturnType<typeof computeStageEnvelope>;
  allocations: number;
  showFinancials: boolean;
}) {
  const { t, i18n } = useTranslation("projects");
  const nf = new Intl.NumberFormat(i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const hasEnv = env.capacityHours > 0 || env.before.allocatedHours > 0;
  const remaining = env.before.remainingHours;
  const label =
    allocations === 0
      ? t("detail.resumo.noOwner")
      : t("detail.resumo.allocations", { count: allocations });
  if (!hasEnv) return <div className="text-[11px] text-muted-foreground">{label}</div>;
  return (
    <UiTip>
      <UiTipTrigger asChild>
        <div tabIndex={0} className="w-fit cursor-default text-[11px] text-muted-foreground">
          {label} ·{" "}
          <span className={remaining < 0 ? "text-destructive" : ""}>
            {t(remaining < 0 ? "detail.resumo.overAllocated" : "detail.resumo.unallocated", {
              hours: nf.format(Math.abs(remaining)),
            })}
          </span>
        </div>
      </UiTipTrigger>
      <UiTipContent className="max-w-xs">
        <StageEnvelopeChip env={env} showFinancials={showFinancials} />
      </UiTipContent>
    </UiTip>
  );
}

// ---- Insights Panel -----------------------------------------------------

type Stage = ReturnType<typeof useProjectDetail>["data"] extends infer T
  ? T extends { stages: infer S }
    ? S extends Array<infer R>
      ? R
      : never
    : never
  : never;

function InsightsPanel({
  projectId,
  canEdit,
  stages,
  invoices,
  invoicedTotal,
  totalBudget,
  totalPlannedCost,
  actualRevenue,
  actualCost,
  actualProfit,
  totalLoggedHours,
  totalPlannedHours,
  stageLoggedHours,
  stageBillableHours,
  stageNonBillableHours,
  stagePlannedHours,
  stageCost,
  stageActuals,
  defaultRates,
  activities,
  timeRows,
  entryFigures,
  historical,
  initialScopeStageId,
}: {
  projectId: string;
  canEdit: boolean;
  stages: Stage[];
  invoices: import("@/lib/projects/use-invoices").Invoice[];
  invoicedTotal: number;
  totalBudget: number;
  totalPlannedCost: number;
  actualRevenue: number;
  actualCost: number;
  actualProfit: number;
  totalLoggedHours: number;
  totalPlannedHours: number;
  stageLoggedHours: (id: string) => number;
  stageBillableHours: (id: string) => number;
  stageNonBillableHours: (id: string) => number;
  stagePlannedHours: (id: string) => number;
  stageCost: (id: string) => number;
  stageActuals: (id: string) => { revenue: number; cost: number; profit: number };
  defaultRates: ReturnType<typeof useDefaultResourceRates>["data"];
  activities: import("@/lib/projects/use-activities").Activity[];
  timeRows: { stage_id: string; month: string; hours: number }[];
  entryFigures: NonNullable<ReturnType<typeof useProjectEntryFigures>["data"]>;
  historical: HistoricalProjectTotals;
  initialScopeStageId?: string | null;
}) {
  const dateLocale = useDateLocale();
  const { t } = useTranslation("projects");
  // ---- Scope selector: whole project vs individual stage (+ descendants) ----
  const [scopeStageId, setScopeStageId] = useState<string | null>(initialScopeStageId ?? null);
  useEffect(() => {
    if (initialScopeStageId !== undefined) setScopeStageId(initialScopeStageId);
  }, [initialScopeStageId]);


  // Build a flat picker list with an indent per nesting level and Gantt-style
  // numbering, sorted by depth-first walk on parent_stage_id / sort_order.
  const stageOptions = useMemo(() => {
    const byParent = new Map<string | null, Stage[]>();
    for (const s of stages) {
      const key = (s as { parent_stage_id?: string | null }).parent_stage_id ?? null;
      const bucket = byParent.get(key) ?? [];
      bucket.push(s);
      byParent.set(key, bucket);
    }
    for (const bucket of byParent.values()) {
      bucket.sort(
        (a, b) =>
          Number((a as { sort_order?: number | null }).sort_order ?? 0) -
          Number((b as { sort_order?: number | null }).sort_order ?? 0),
      );
    }
    const out: { id: string; label: string; depth: number }[] = [];
    const walk = (parent: string | null, depth: number, prefix: string) => {
      const children = byParent.get(parent) ?? [];
      children.forEach((s, i) => {
        const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        out.push({ id: s.id, label: `${num} ${s.name}`, depth });
        walk(s.id, depth + 1, num);
      });
    };
    walk(null, 0, "");
    return out;
  }, [stages]);

  // Resolve a stage + its descendants → the set of stage IDs to aggregate over.
  const scopeStageIds = useMemo(() => {
    if (!scopeStageId) return null;
    const childrenOf = new Map<string, string[]>();
    for (const s of stages) {
      const p = (s as { parent_stage_id?: string | null }).parent_stage_id ?? null;
      if (!p) continue;
      const arr = childrenOf.get(p) ?? [];
      arr.push(s.id);
      childrenOf.set(p, arr);
    }
    const out = new Set<string>([scopeStageId]);
    const queue = [scopeStageId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const c of childrenOf.get(cur) ?? []) {
        if (!out.has(c)) {
          out.add(c);
          queue.push(c);
        }
      }
    }
    return out;
  }, [scopeStageId, stages]);

  // Stage-scoped view of the props. When scopeStageIds is null we keep the
  // whole-project numbers passed in by the parent (single source of truth).
  const scoped = useMemo(() => {
    if (!scopeStageIds) {
      return {
        stages,
        totalBudget,
        totalPlannedCost,
        actualRevenue,
        actualCost,
        actualProfit,
        totalLoggedHours,
        totalPlannedHours,
        invoicedTotal,
        historical,
      };
    }
    const inScope = stages.filter((s) => scopeStageIds.has(s.id));
    const budget = inScope.reduce(
      (sum, s) =>
        (s as { stage_kind?: string | null }).stage_kind === "retainer_month"
          ? sum
          : sum + Number(s.budget),
      0,
    );
    const plannedCost = inScope.reduce((a, s) => a + stageCost(s.id), 0);
    const plannedH = inScope.reduce((a, s) => a + stagePlannedHours(s.id), 0);
    const loggedH = inScope.reduce((a, s) => a + stageLoggedHours(s.id), 0);
    const act = inScope.reduce(
      (acc, s) => {
        const v = stageActuals(s.id);
        acc.revenue += v.revenue;
        acc.cost += v.cost;
        return acc;
      },
      { revenue: 0, cost: 0 },
    );
    // Imported/historical, invoices and project-level extras are not stage-
    // scoped in the data model, so they collapse to zero in stage mode.
    const emptyHist: HistoricalProjectTotals = EMPTY_HISTORICAL_TOTALS;
    return {
      stages: inScope,
      totalBudget: budget,
      totalPlannedCost: plannedCost,
      actualRevenue: act.revenue,
      actualCost: act.cost,
      actualProfit: act.revenue - act.cost,
      totalLoggedHours: loggedH,
      totalPlannedHours: plannedH,
      invoicedTotal: 0,
      historical: emptyHist,
    };
  }, [
    scopeStageIds,
    stages,
    stageCost,
    stagePlannedHours,
    stageLoggedHours,
    stageActuals,
    totalBudget,
    totalPlannedCost,
    actualRevenue,
    actualCost,
    actualProfit,
    totalLoggedHours,
    totalPlannedHours,
    invoicedTotal,
    historical,
  ]);

  // From here on, use the scoped values. Aliased so the existing computation
  // block below stays readable.
  const scopedStages = scoped.stages;
  totalBudget = scoped.totalBudget;
  totalPlannedCost = scoped.totalPlannedCost;
  actualRevenue = scoped.actualRevenue;
  actualCost = scoped.actualCost;
  actualProfit = scoped.actualProfit;
  totalLoggedHours = scoped.totalLoggedHours;
  totalPlannedHours = scoped.totalPlannedHours;
  invoicedTotal = scoped.invoicedTotal;
  historical = scoped.historical;


  type ResAgg = {
    id: string;
    name: string;
    color: string;
    collaborator_id?: string | null;
    plannedHours: number;
    plannedCost: number;
    plannedSale: number;
    loggedHours: number;
  };
  const byRes = new Map<string, ResAgg>();
  for (const s of scopedStages) {
    for (const a of s.allocations.filter(a => !a.planning_removed_at)) {
      const key = a.resource.id;
      const existing =
        byRes.get(key) ??
        ({
          id: a.resource.id,
          name: a.resource.name,
          color: a.resource.color,
          collaborator_id: (a.resource as { collaborator_id?: string | null })
            .collaborator_id,
          plannedHours: 0,
          plannedCost: 0,
          plannedSale: 0,
          loggedHours: 0,
        } as ResAgg);
      const hours = allocationHours({
        start_date: a.start_date,
        end_date: a.end_date,
        hours_per_day: Number(a.hours_per_day),
      });
      const costRate = effectiveCostRate(
        a.resource.cost_rate,
        a.resource.id,
        defaultRates,
        !!a.resource.hourly_rate_is_override,
      );
      const saleRate = effectiveSaleRate(
        a.resource.hourly_rate,
        a.resource.id,
        defaultRates,
        !!a.resource.hourly_rate_is_override,
      );
      existing.plannedHours += hours;
      existing.plannedCost += hours * costRate;
      existing.plannedSale += hours * saleRate;
      byRes.set(key, existing);
    }
  }
  // Track per-resource logged cost & billable hours.
  // Cost includes ALL hours logged to the project (billable + non-billable).
  // Revenue (earned value) only comes from billable hours × sale rate.
  const loggedCostByRes = new Map<string, number>();
  const billableValueByRes = new Map<string, number>();
  const billableHoursByRes = new Map<string, number>();
  for (const e of entryFigures) {
    if (!e.stageId || !scopedStages.some(s => s.id === e.stageId)) continue;
    const r = e.resource;
    if (!r) continue;
    const agg = byRes.get(r.id) ?? { id:r.id, name:r.name, color:r.color, collaborator_id:r.collaborator_id, plannedHours:0, plannedCost:0, plannedSale:0, loggedHours:0 };
    agg.loggedHours += e.hours;
    byRes.set(r.id,agg);
    loggedCostByRes.set(r.id,(loggedCostByRes.get(r.id) ?? 0)+e.cost);
    billableHoursByRes.set(r.id,(billableHoursByRes.get(r.id) ?? 0)+e.billableHours);
    billableValueByRes.set(r.id,(billableValueByRes.get(r.id) ?? 0)+e.value);
  }
  const resources = Array.from(byRes.values()).sort(
    (a, b) => b.plannedHours - a.plannedHours,
  );

  // Single source of truth — totals come from the parent (same as Overview):
  //   actualRevenue = Σ billable hours × sale rate
  //   actualCost    = Σ all logged hours × cost rate
  //   actualProfit  = actualRevenue − actualCost
  // Per-resource breakdowns below are recomputed for charts only and use the
  // same formulas, so per-resource sums reconcile with the totals above.
  // Hours coming from imported historical entries (e.g. Accelo) are not
  // attached to allocations/tasks, so we add them at the project total level
  // for hour pills only — never per-resource and never per-stage.
  const histLoggedHours = historical.loggedHours;
  const histBillable = historical.billableHours;
  const earnedValue = actualRevenue;
  const totalBillableHours = Array.from(billableHoursByRes.values()).reduce(
    (a, b) => a + b,
    0,
  ) + histBillable;
  const displayedLoggedHours = totalLoggedHours + histLoggedHours;
  const totalNonBillableHours = Math.max(0, displayedLoggedHours - totalBillableHours);
  const loggedCost = actualCost;
  // Planned (forecast) sale value from allocations — used as the upper bound
  // for the "Forecast Value" bar.
  const plannedRevenue = resources.reduce((a, r) => a + r.plannedSale, 0);
  const forecastValue = Number.isFinite(plannedRevenue) ? (plannedRevenue > 0 ? plannedRevenue : earnedValue) : NaN;
  const earnedPct = forecastValue > 0 ? earnedValue / forecastValue : 0;
  const forecastPct = forecastValue > 0 ? 1 : 0;

  // Profitability — actual vs forecast (using planned revenue & planned cost)
  const profitCurrent = actualProfit;
  const conclusion = scopedStages.reduce((acc,s) => {
    const plan = s.allocations.reduce((p,a) => {
      const figures = plannedAllocationFigures(a, { cost: effectiveCostRate(a.resource.cost_rate,a.resource.id,defaultRates,!!a.resource.hourly_rate_is_override), sale: effectiveSaleRate(a.resource.hourly_rate,a.resource.id,defaultRates,!!a.resource.hourly_rate_is_override) });
      return { hours:p.hours+figures.hours,cost:p.cost+figures.cost,value:p.value+figures.value };
    },{hours:0,cost:0,value:0});
    const actual = stageActuals(s.id);
    const f = completionForecast({ plannedHours:plan.hours, plannedCost:plan.cost, plannedValue:plan.value, loggedHours:stageLoggedHours(s.id), actualCost:actual.cost, earnedValue:actual.revenue, done: s.status === 'done' || s.status === 'cancelled' });
    return { value:acc.value+f.value,cost:acc.cost+f.cost,remaining:acc.remaining+f.remainingHours };
  },{value:historical.amount,cost:historical.cost,remaining:0});
  const profitForecast = financialResult(conclusion.value, conclusion.cost + (actualCost - scopedStages.reduce((n,s)=>n+stageActuals(s.id).cost,0) - historical.cost)).profit;
  const profitMarginCurrent =
    Number.isFinite(profitCurrent) && earnedValue > 0 ? Math.round((profitCurrent / earnedValue) * 100) : NaN;
  const profitMarginForecast =
    Number.isFinite(profitForecast) && conclusion.value > 0 ? Math.round((profitForecast / conclusion.value) * 100) : NaN;

  const wipHours = conclusion.remaining;
  const workDonePct =
    totalPlannedHours > 0
      ? displayedLoggedHours / totalPlannedHours
      : 0;
  const forecastDonePct = workDonePct;

  const monthMap = new Map<
    string,
    { key: string; label: string; activities: number; hours: number }
  >();
  const scopedActivities = scopeStageIds
    ? activities.filter((a) => a.stage_id && scopeStageIds.has(a.stage_id))
    : activities;
  for (const a of scopedActivities) {
    const d = parseISO(a.created_at);
    const key = format(d, "yyyy-MM");
    const label = format(d, "MMM yyyy", { locale: dateLocale });
    const cur = monthMap.get(key) ?? {
      key,
      label,
      activities: 0,
      hours: 0,
    };
    cur.activities += 1;
    monthMap.set(key, cur);
  }
  const scopedTimeRows = scopeStageIds
    ? timeRows.filter((row) => scopeStageIds.has(row.stage_id))
    : timeRows;
  for (const row of scopedTimeRows) {
    const d = parseISO(`${row.month}-01`);
    const cur = monthMap.get(row.month) ?? {
      key: row.month,
      label: format(d, "MMM yyyy", { locale: dateLocale }),
      activities: 0,
      hours: 0,
    };
    cur.hours += Number(row.hours ?? 0);
    monthMap.set(row.month, cur);
  }
  const months = Array.from(monthMap.values()).sort((a, b) =>
    a.key < b.key ? -1 : 1,
  );
  const maxAct = Math.max(1, ...months.map((m) => m.activities));
  const maxHours = Math.max(1, ...months.map((m) => m.hours));

  // Financials use earned value minus actual cost. Contract budget stays separate.
  // Pull totals from the immutable contract baseline so the Insights box
  // matches the Suppliers tab numbers exactly:
  //   Suppliers (Materials column) budget = total_external_fee
  //   Services budget                      = total_internal_fee (architecture only)
  // Falls back to quote_external_services revenue if baseline missing.
  const insightsBaselineQ = useContractBaseline(projectId);
  const baselineHeader = insightsBaselineQ.data?.header ?? null;
  const insightsSourceQuoteId = baselineHeader?.quote_id ?? null;
  const quoteExternalQ = useQuoteExternalServices(insightsSourceQuoteId ?? undefined);
  const quoteExtItems = quoteExternalQ.data ?? [];
  const fallbackExt = quoteExtItems.reduce(
    (acc: { budget: number; cost: number }, m) => {
      const qty = Number(m.quantity || 1);
      acc.cost += Number(m.purchase_price || 0) * qty;
      acc.budget += Number(m.sale_price || 0) * qty;
      return acc;
    },
    { budget: 0, cost: 0 },
  );
  // Fallback when baseline header totals were not populated (legacy projects):
  // recompute internal/external splits from the source quote's stages directly.
  const quoteStagesQ = useQuoteStages(insightsSourceQuoteId ?? undefined);
  const stageTotals = (quoteStagesQ.data ?? []).reduce(
    (acc, s) => {
      const b = Number(s.budget || 0);
      if (s.is_self) acc.internal += b;
      else acc.external += b;
      return acc;
    },
    { internal: 0, external: 0 },
  );
  const baseExternal = Number(baselineHeader?.total_external_fee ?? 0) || 0;
  const baseInternal = Number(baselineHeader?.total_internal_fee ?? 0) || 0;
  const suppliersBudget =
    baseExternal > 0
      ? baseExternal
      : stageTotals.external > 0
        ? stageTotals.external
        : fallbackExt.budget;
  const architectureBudget =
    baseInternal > 0
      ? baseInternal
      : stageTotals.internal > 0
        ? stageTotals.internal
        : Math.max(0, totalBudget - suppliersBudget);
  const externalItemsQ = useExternalServices(projectId);
  const externalRow = scopeStageIds ? { budget:0,value:0,cost:0,profit:0,invoiced:0 } : { ...rollupExternalServices(externalItemsQ.data ?? []), budget:suppliersBudget };

  const services = {
    budget: architectureBudget,
    value: earnedValue,
    cost: loggedCost,
    profit: financialResult(earnedValue, loggedCost).profit,
    invoiced: invoicedTotal,
  };

  const projectExpensesQuery = useProjectExpenses(projectId);
  const expItems = projectExpensesQuery.data ?? [];
  const expensesRow = scopeStageIds ? {budget:0,value:0,cost:0,profit:0,invoiced:0} : rollupExpenses(expItems);
  const totalRow = sumFinancialsRows(services, externalRow, expensesRow);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
           {t("projects:detail.ui.scope")} </label>
        <select
          value={scopeStageId ?? ""}
          onChange={(e) => setScopeStageId(e.target.value || null)}
          className="min-w-[240px] rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value=""> {t("projects:detail.ui.wholeProject")} </option>
          {stageOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {"\u00A0".repeat(o.depth * 2)}
              {o.label}
            </option>
          ))}
        </select>
        {scopeStageId && (
          <span className="text-[11px] text-muted-foreground">
             {t("projects:detail.ui.projectWideHint")} </span>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <InsightCard title={t("projects:detail.ui.activitiesHours")}>
          <ActivitiesHoursChart data={months} maxAct={maxAct} maxHours={maxHours} />
        </InsightCard>
        <InsightCard title={t("glossary:financial.revenue")}>
          <div className="space-y-4 px-1 pt-1">
            <BarRow
              label={t("projects:detail.ui.actualRevenue")}
              value={earnedValue}
              pct={earnedPct}
              over={earnedValue > forecastValue && forecastValue > 0}
            />
            <UnapprovedPill projectId={projectId} />
            <BarRow
              label={t("insightsFinance.plannedValue")}
              value={forecastValue}
              pct={forecastPct}
              over={forecastValue < totalPlannedCost}
            />
          </div>
          <div className="mt-3 px-1 text-[10px] text-muted-foreground">
             {t("projects:detail.ui.revenueCalculationHint")} </div>
        </InsightCard>
      </div>

      {(!Number.isFinite(earnedValue) || !Number.isFinite(loggedCost)) && <p role="status" className="text-sm text-destructive">{t("insightsFinance.incomplete")}</p>}
      {entryFigures.some(e=>e.estimatedValue) && <p className="text-xs text-muted-foreground">{t("insightsFinance.estimated")}</p>}
      <InsightCard title={t("projects:detail.ui.profitability")}>
        <div className="grid gap-6 px-2 py-2 sm:grid-cols-2">
          <GaugeStat label={t("projects:detail.ui.currentMargin")} money={profitCurrent} pct={profitMarginCurrent} />
          <GaugeStat label={t("insightsFinance.conclusionMargin")} money={profitForecast} pct={profitMarginForecast} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 px-2 pb-3 text-xs">
          <HoursPill label={t("glossary:time.billable")} hours={totalBillableHours} tone="ok" />
          <HoursPill label={t("projects:detail.ui.nonBillable")} hours={totalNonBillableHours} tone="warn" />
          <HoursPill label={t("projects:detail.ui.totalLogged")} hours={displayedLoggedHours} tone="muted" />
        </div>
        {historical.rowCount > 0 && (
          <div className="mx-2 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {historical.sources.join(", ") || t("common:imported")}
            </Badge>
            <span>
              {t("projects:detail.ui.historical", { count: historical.rowCount })}
              {" · "}
              {Math.round(histLoggedHours)} {t("common:units.hoursDot")} {euros(historical.cost)} {t("glossary:financial.cost")}
            </span>
          </div>
        )}
      </InsightCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <InsightCard title={t("projects:nav.financials")}>
          <FinancialsTable
            services={services}
            materials={externalRow}
            expenses={expensesRow}
            total={totalRow}
          />
        </InsightCard>
        <InsightCard title={t("common:work")}>
          <div className="grid grid-cols-2 gap-4 px-2 py-2">
            <div className="flex flex-col items-center">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("insightsFinance.remainingPlan")}
              </div>
              <Gauge value={wipHours} formatter={(v) => `${Math.round(v)}h`} pct={0} muted />
              <button className="mt-2 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
                 {t("projects:detail.ui.viewTasks")} </button>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t("insightsFinance.hoursConsumed")}
              </div>
              <Gauge
                value={workDonePct * 100}
                formatter={(v) => `${Math.round(v)}%`}
                pct={workDonePct}
              />
            </div>
          </div>
        </InsightCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard title={t("projects:detail.ui.workDone")}>
          <ResourceBarList
            resources={resources}
            getValue={(r) =>
              r.plannedHours > 0 ? Math.min(1, r.loggedHours / r.plannedHours) : 0
            }
            getLabel={(r) => formatHm(r.loggedHours)}
            tone="ok"
          />
        </InsightCard>
        <InsightCard title={t("glossary:financial.budget")}>
          <ResourceBarList
            resources={resources}
            getValue={(r) =>
              r.plannedSale > 0 ? Math.min(1.5, r.plannedCost / r.plannedSale) : 0
            }
            getLabel={(r) =>
              r.plannedSale > 0
                ? `${Math.round((r.plannedCost / r.plannedSale) * 100)}%`
                : "0%"
            }
            tone="auto"
          />
        </InsightCard>
      </div>



    </div>
  );
}

function UnapprovedPill({ projectId }: { projectId: string }) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  const { data } = useProjectPendingHours(projectId);
  if (!data || data.total === 0) return null;
  const totalHours = data.groups.reduce((s, g) => s + g.totalHours, 0);
  const totalValue = data.groups.reduce((s, g) => s + g.billableAmount, 0);
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId }}
      search={{ tab: "approvals" }}
      className="flex items-center justify-between rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs dark:border-amber-500/30 dark:bg-amber-500/10"
    >
      <span className="font-medium text-amber-800 dark:text-amber-300">
        {t("projects:detail.ui.unapproved", { count: data.total, value: euros(totalValue), hours: formatNumber(totalHours, 1) })}
      </span>
      <span className="text-amber-700 hover:underline dark:text-amber-300">
        {t("projects:detail.ui.review")}
      </span>
    </Link>
  );
}

function InsightCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ActivitiesHoursChart({
  data,
}: {
  data: { key: string; label: string; activities: number; hours: number }[];
  maxAct: number;
  maxHours: number;
}) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
         {t("projects:detail.ui.noActivityYet")} </div>
    );
  }
  return (
    <div className="h-[280px] w-full px-1">
      <RC.ResponsiveContainer width="100%" height="100%">
        <RC.ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 20, left: 0 }}>
          <RC.CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <RC.XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <RC.YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            label={{
              value: t("common:activities"),
              angle: -90,
              position: "insideLeft",
              style: { fill: "var(--muted-foreground)", fontSize: 11 },
            }}
            allowDecimals={false}
          />
          <RC.YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            label={{
              value: t("projects:detail.ui.hours"),
              angle: 90,
              position: "insideRight",
              style: { fill: "var(--muted-foreground)", fontSize: 11 },
            }}
            allowDecimals={false}
          />
          <RC.Tooltip
            contentStyle={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <RC.Legend wrapperStyle={{ fontSize: 12 }} />
          <RC.Bar
            yAxisId="left"
            dataKey="activities"
            name={t("common:activities")}
            fill="var(--primary)"
            barSize={18}
            radius={[2, 2, 0, 0]}
          />
          <RC.Area
            yAxisId="right"
            type="monotone"
            dataKey="hours"
            name={t("projects:detail.ui.hours")}
            stroke="var(--color-budget-spent, #10b981)"
            fill="var(--color-budget-spent, #10b981)"
            fillOpacity={0.25}
            strokeWidth={2}
          />
        </RC.ComposedChart>
      </RC.ResponsiveContainer>
    </div>
  );
}

function BarRow({
  label,
  value,
  pct,
  over,
}: {
  label: string;
  value: number;
  pct: number;
  over: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-foreground">
        {label} <span className="font-mono font-semibold">{euros(value)}</span>{" "}
        <span className="text-muted-foreground">({Number.isFinite(pct) ? `${Math.round(pct * 100)}%` : "—"})</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-full"
          style={{
            width: `${Math.max(0, Math.min(100, pct * 100))}%`,
            backgroundColor: over
              ? "var(--color-budget-over)"
              : "var(--color-budget-spent)",
          }}
        />
      </div>
    </div>
  );
}

function Gauge({
  value,
  pct,
  formatter,
  muted,
}: {
  value: number;
  pct: number;
  formatter: (v: number) => string;
  muted?: boolean;
}) {
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const dash = Number.isFinite(pct) ? Math.max(0, Math.min(1, Math.abs(pct))) * circ : 0;
  const negative = pct < 0;
  const stroke = muted
    ? "var(--muted-foreground)"
    : negative
      ? "var(--color-budget-over)"
      : "var(--color-budget-spent)";
  return (
    <div className="relative mt-1.5 h-[80px] w-[80px]">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={radius} stroke="var(--border)" strokeWidth="6" fill="none" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          stroke={stroke}
          strokeWidth="6"
          fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
        {Number.isFinite(value) ? formatter(value) : "—"}
      </div>
    </div>
  );
}

function GaugeStat({
  label,
  money,
  pct,
}: {
  label: string;
  money: number;
  pct: number;
}) {
  const negative = money < 0;
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 font-mono text-lg font-semibold",
            negative ? "text-destructive" : "text-foreground",
          )}
        >
          {euros(money)}
        </div>
      </div>
      <Gauge value={pct} pct={pct / 100} formatter={(v) => `${Math.round(v)}%`} />
    </div>
  );
}

function HoursPill({
  label,
  hours,
  tone,
}: {
  label: string;
  hours: number;
  tone: "ok" | "warn" | "muted";
}) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  const toneClass =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <div className={cn("rounded-md px-2 py-1.5", toneClass)}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="font-mono text-sm font-semibold">{Math.round(hours * 10) / 10} {t("common:units.hoursShort")} </div>
    </div>
  );
}

function FinancialsTable({
  services,
  materials,
  expenses,
  total,
}: {
  services: { budget: number; value: number; cost: number; profit: number; invoiced: number };
  materials: { budget: number; value: number; cost: number; profit: number; invoiced: number };
  expenses: { budget: number; value: number; cost: number; profit: number; invoiced: number };
  total: { budget: number; value: number; cost: number; profit: number; invoiced: number };
}) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  const rows: { label: string; key: keyof typeof services }[] = [
    { label: t("glossary:financial.budget"), key: "budget" },
    { label: t("glossary:financial.value"), key: "value" },
    { label: t("glossary:financial.cost"), key: "cost" },
    { label: t("glossary:financial.profit"), key: "profit" },
    { label: t("projects:detail.ui.invoiced"), key: "invoiced" },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <th className="px-2 py-2 text-left font-semibold"></th>
          <th className="px-2 py-2 font-semibold"> {t("common:services")} </th>
          <th className="px-2 py-2 font-semibold"> {t("projects:detail.ui.suppliers")} </th>
          <th className="px-2 py-2 font-semibold"> {t("projects:detail.tabs.expenses")} </th>
          <th className="px-2 py-2 font-semibold"> {t("common:total")} </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const isProfit = r.key === "profit";
          // Profit = Budget (incoming) − Costs. The Value column is the
          // hypothetical sale value of resources and is intentionally ignored
          // when computing profit/margin.
          const profitPct =
            isProfit && services.budget > 0
              ? Math.round((services.profit / services.budget) * 100)
              : null;
          const totalPct =
            isProfit && total.budget > 0
              ? Math.round((total.profit / total.budget) * 100)
              : null;
          return (
            <tr key={r.key} className="border-b border-border/60 last:border-b-0">
              <td className="px-2 py-2 text-xs text-muted-foreground">{r.label}</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                {euros(services[r.key])}
                {profitPct !== null && (
                  <div className="text-[10px] text-muted-foreground">{profitPct}%</div>
                )}
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                {euros(materials[r.key])}
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                {euros(expenses[r.key])}
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                {euros(total[r.key])}
                {totalPct !== null && (
                  <div className="text-[10px] text-muted-foreground">{totalPct}%</div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ResourceBarList<
  R extends {
    id: string;
    name: string;
    color: string;
    collaborator_id?: string | null;
  },
>({
  resources,
  getValue,
  getLabel,
  tone,
}: {
  resources: R[];
  getValue: (r: R) => number;
  getLabel: (r: R) => string;
  tone: "ok" | "auto";
}) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  if (resources.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
         {t("projects:detail.ui.noAllocations")} </div>
    );
  }
  return (
    <div className="space-y-3">
      {resources.map((r) => {
        const v = getValue(r);
        const over = v > 1;
        const colour =
          tone === "auto"
            ? over
              ? "var(--color-budget-over)"
              : "var(--color-budget-spent)"
            : "var(--color-budget-spent)";
        return (
          <div key={r.id} className="flex items-center gap-3">
            <CollaboratorAvatar
              collaboratorId={r.collaborator_id ?? null}
              name={r.name}
              color={r.color}
              size={28}
            />
            <div className="flex-1">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, v * 100))}%`,
                    backgroundColor: colour,
                  }}
                />
              </div>
            </div>
            <div className="w-20 text-right font-mono text-xs tabular-nums">
              {getLabel(r)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Cells ---------------------------------------------------------------

function StatusDot({ active, label, dotOnly }: { active: boolean; label: string; dotOnly?: boolean }) {
  if (dotOnly) {
    return (
      <UiTip>
        <UiTipTrigger asChild>
          <span
            role="img"
            aria-label={label}
            tabIndex={0}
            className={cn("inline-block h-2 w-2 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/40")}
          />
        </UiTipTrigger>
        <UiTipContent>{label}</UiTipContent>
      </UiTip>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          active ? "bg-emerald-500" : "bg-muted-foreground/40",
        )}
      />
      <span className={active ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
        {label}
      </span>
    </span>
  );
}

/**
 * Cost (actual vs budget).
 *  - Always shows the actual cost in €.
 *  - Shows budget reference and progress bar ONLY when budget > 0.
 *  - Avoids meaningless 0% / over-budget signals when no budget is defined.
 */
function CostVsBudgetCell({
  cost,
  budget,
  over,
  isHourly,
  revenue = 0,
}: {
  cost: number;
  budget: number;
  over: boolean;
  /** Time-and-materials stage: no fixed budget, revenue comes from billable hours. */
  isHourly?: boolean;
  /** Earned revenue (billable hours × sale rate), used as the T&M reference. */
  revenue?: number;
}) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  const hasBudget = budget > 0;
  // T&M stages have no budget by design: compare cost against earned revenue
  // instead of showing a meaningless "no budget" marker.
  const tm = !hasBudget && !!isHourly;
  const pct = hasBudget
    ? Math.min(1, cost / budget)
    : tm && revenue > 0
      ? Math.min(1, cost / revenue)
      : 0;
  return (
    <div>
      <div className="flex items-baseline justify-end gap-3 text-xs">
        <span className="whitespace-nowrap font-mono tabular-nums">
          <span className={over ? "text-destructive font-semibold" : "text-foreground"}>
            <Num value={cost} kind="eur" />
          </span>
          {hasBudget ? (
            <span className="text-muted-foreground"> / {fmtEur(budget)}</span>
          ) : tm ? (
            <span className="text-muted-foreground">
              {" "}
              / <Num value={revenue} kind="eur" />
              <span className="ml-1 text-[10px] uppercase tracking-wider"> {t("common:timeMaterials")} </span>
            </span>
          ) : (
            <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
               {t("projects:detail.ui.noBudget")} </span>
          )}
        </span>

        {(hasBudget || (tm && revenue > 0)) && (
          <span
            className={cn(
              "w-9 text-right tabular-nums",
              over || (tm && cost > revenue)
                ? "text-destructive font-semibold"
                : "text-muted-foreground",
            )}
          >
            {Math.round(pct * 100)}%
          </span>
        )}
      </div>
      {(hasBudget || (tm && revenue > 0)) && (
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(100, pct * 100))}%`,
              backgroundColor:
                over || (tm && cost > revenue)
                  ? "var(--color-budget-over)"
                  : "var(--color-budget-spent)",
            }}
          />
        </div>
      )}

    </div>
  );
}

/**
 * Revenue (earned) — billable hours × sale rate.
 * Shown standalone (no budget percentage) so the figure is unambiguous.
 */
function RevenueEarnedCell({ revenue }: { revenue: number }) {
  return (
    <div className="text-xs">
      <span className="font-mono tabular-nums text-foreground">
        <Num value={revenue} kind="eur" />
      </span>
    </div>
  );
}

/** Formats € as "€9.554" (thousands with a dot, no decimals). */
function fmtEur(n: number): string {
  return new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

/** Number with a faint "–" for zero. */
function Num({ value, kind }: { value: number; kind: "eur" | "hours" }) {
  if (!Number.isFinite(value) || Math.abs(value) < (kind === "eur" ? 0.5 : 1 / 120)) {
    return <span className="text-muted-foreground/50" aria-label="0">–</span>;
  }
  return <>{kind === "eur" ? fmtEur(value) : formatHm(value)}</>;
}

/**
 * Profit + margin.
 *  - Profit = revenue − cost (always meaningful).
 *  - Margin shown only when revenue > 0 (otherwise denominator = 0).
 */
function ProfitMarginCell({ revenue, cost }: { revenue: number; cost: number }) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  const profit = revenue - cost;
  const hasRevenue = revenue > 0;
  const margin = hasRevenue ? (profit / revenue) * 100 : 0;
  const tone =
    profit < 0
      ? "text-destructive"
      : hasRevenue && margin < 15
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="text-xs">
      <span className={cn("font-mono font-semibold tabular-nums", profit === 0 ? "" : tone)}>
        <Num value={profit} kind="eur" />
      </span>
      {hasRevenue ? (
        <div className={cn("mt-0.5 text-[10px] tabular-nums", tone)}>
          {margin >= 0 ? "+" : ""}
          {t("projects:detail.ui.marginValue", { value: formatNumber(margin, 1) })}
        </div>
      ) : (
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
           {t("projects:detail.ui.noRevenue")} </div>
      )}
    </div>
  );
}

/** Sub-row planned amount (allocation forecast). Dimmed to differentiate from actuals. */
function PlannedAmountCell({ amount, label }: { amount: number; label: string }) {
  const { t } = useTranslation("projects");
  void label;
  return (
    <UiTip>
      <UiTipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "font-mono text-xs italic tabular-nums",
            amount < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          <Num value={amount} kind="eur" />
        </span>
      </UiTipTrigger>
      <UiTipContent>{t("detail.resumo.plannedTip")}</UiTipContent>
    </UiTip>
  );
}

function UsageBudgetCell({
  logged,
  planned,
  over,
}: {
  logged: number;
  planned: number;
  over: boolean;
}) {
  const hoursOver = planned > 0 && logged > planned;
  return (
    <div className="flex items-center justify-end gap-2 font-mono text-xs tabular-nums">
      <span className={over ? "text-destructive font-semibold" : "text-foreground"}>
        <Num value={logged} kind="hours" />
      </span>
      <span className="text-muted-foreground">/</span>
      <span
        className={cn(
          "min-w-[4.5rem] rounded px-1.5 py-0.5 text-right text-[11px]",
          hoursOver ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        <Num value={planned} kind="hours" />
      </span>
    </div>
  );
}

function DateLink({ date }: { date: Date }) {
  const dateLocale = useDateLocale();
  return (
    <span className="text-xs text-foreground underline decoration-dotted decoration-muted-foreground/60 underline-offset-4">
      {format(date, "d MMM", { locale: dateLocale })}
    </span>
  );
}

function dayDiffInclusive(start: string, end: string) {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
}

function formatHm(hours: number) {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  if (!Number.isFinite(hours)) return i18n.t("common:duration.hoursMinutes", { hours: 0, minutes: 0 });
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return i18n.t("common:duration.hoursMinutes", { hours: h, minutes: m });
}

function formatNumber(value: number, digits?: number): string {
  return new Intl.NumberFormat(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits ?? 2 }).format(value);
}
