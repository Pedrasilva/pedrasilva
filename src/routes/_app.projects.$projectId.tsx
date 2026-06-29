import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useRecordRecentlyViewed } from "@/hooks/use-recently-viewed";
import { AppShell } from "@/components/projects/app-shell";
import { GanttChart } from "@/components/projects/gantt-chart";
import { ProjectGantt } from "@/components/planner/planner-gantt";
import { useProjectPlannerAdapter } from "@/lib/projects/use-project-planner-adapter";
import { useAuth } from "@/hooks/use-auth";
import { ProjectPlannerInspector } from "@/components/projects/project-planner-inspector";
import { ResourcePool } from "@/components/projects/resource-pool";
import { NewStageDialog } from "@/components/projects/new-stage-dialog";
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
import { ProjectFinancialTab } from "@/components/projects/project-financial-tab";
import { HardDeleteProjectButton } from "@/components/projects/hard-delete-project-button";
import { useHistoricalProjectTotals, EMPTY_HISTORICAL_TOTALS, type HistoricalProjectTotals } from "@/lib/projects/use-historical-time";
import { useStageBudgetControl } from "@/lib/projects/use-stage-budget-control";
import { BudgetControlPanel } from "@/components/projects/budget-control-panel";
import { RetainerMonitorPanel } from "@/components/projects/retainer-monitor-panel";
import { CommercialBaselineCard } from "@/components/projects/commercial-baseline-card";
import { ContractBaselineCard } from "@/components/projects/contract-baseline-card";
import { ProjectForecastCard } from "@/components/projects/project-forecast-card";
import { useContractBaseline } from "@/lib/projects/use-contract-baseline";
import { QuotePlanningTab } from "@/components/quotes/quote-planning-tab";
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
  MoreVertical,
  Pencil,
  UserPlus,
  DollarSign,
  FileText,
} from "lucide-react";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetail,
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
  | "stream"
  | "planning"
  | "architecture"
  | "consultants"
  | "incoming"
  | "outgoing"
  | "paymentSchedule"
  | "financialSummary";


function ProjectDetail() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const { data, isLoading, error } = useProjectDetail(projectId, { includeCancelled: showCancelled });
  const { data: resources } = useResources();
  const { isAdmin } = useAuth();
  const ganttAdapter = useProjectPlannerAdapter(resources ?? [], { readOnly: !isAdmin });
  const { data: defaultRates } = useDefaultResourceRates();
  const { data: invoices } = useProjectInvoices(projectId);
  const { data: activities } = useProjectActivities(projectId);
  const updateProject = useUpdateProject();
  const { allowed: canSeeFinancials } = useHasPermission("projects.financials");
  const { data: budgetControl } = useStageBudgetControl({ projectId, defaultRates });

  useRecordRecentlyViewed({
    module: "projects",
    href: `/projects/${projectId}`,
    label: data?.project?.name ?? "",
  });

  const [tab, setTab] = useState<TabKey>("overview");
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

  // Real time entries for this project (per stage via allocation→stage), split by billable
  const { data: timeRows } = useQuery({
    queryKey: ["pm-project-time", projectId],
    enabled: !!projectId && !!data,
    queryFn: async () => {
      if (!data)
        return [] as { stage_id: string; hours: number; billableHours: number; nonBillableHours: number }[];
      const allocIds = data.stages.flatMap((s) =>
        s.allocations.map((a) => a.id),
      );
      if (allocIds.length === 0) return [];
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
      if (taskIds.length === 0) return [];
      const { data: entries } = await supabase
        .from("pm_time_entries")
        .select("task_id, hours, billable")
        .in("task_id", taskIds)
        .eq("entry_type", "project")
        .not("task_id", "is", null);
      const byStage = new Map<
        string,
        { hours: number; billableHours: number; nonBillableHours: number }
      >();
      for (const e of (entries ?? []) as Array<{
        task_id: string;
        hours: number;
        billable: boolean;
      }>) {
        const allocId = taskToAlloc.get(e.task_id);
        const stageId = allocId ? allocToStage.get(allocId) : undefined;
        if (!stageId) continue;
        const h = Number(e.hours);
        const cur = byStage.get(stageId) ?? { hours: 0, billableHours: 0, nonBillableHours: 0 };
        cur.hours += h;
        if (e.billable) cur.billableHours += h;
        else cur.nonBillableHours += h;
        byStage.set(stageId, cur);
      }
      return Array.from(byStage, ([stage_id, v]) => ({ stage_id, ...v }));
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

  const summaryLabel = t("projects:gantt.projectSummary", { defaultValue: "Project" });
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
        label: inv.invoice_number || inv.title || "Invoice",
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
          A carregar projecto…
        </div>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell active="projects">
        <div className="p-12 text-center text-sm text-destructive">
          Não foi possível carregar.
        </div>
      </AppShell>
    );
  }

  const { project, stages } = data;

  // ---- Aggregations -----------------------------------------------------
  const totalBudget = stages.reduce((sum, s) => sum + Number(s.budget), 0);

  const stageCost = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return 0;
    return s.allocations.reduce(
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
          ),
        }),
      0,
    );
  };
  const stagePlannedHours = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return 0;
    return s.allocations.reduce(
      (acc, a) =>
        acc +
        allocationHours({
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day),
        }),
      0,
    );
  };
  const stageLoggedHours = (stageId: string) =>
    timeRows?.find((r) => r.stage_id === stageId)?.hours ?? 0;
  const stageBillableHours = (stageId: string) =>
    timeRows?.find((r) => r.stage_id === stageId)?.billableHours ?? 0;
  const stageNonBillableHours = (stageId: string) =>
    timeRows?.find((r) => r.stage_id === stageId)?.nonBillableHours ?? 0;

  // ---- Single source of truth: Actuals --------------------------------
  // Distribute a stage's logged hours across allocations proportionally to
  // planned hours, then apply each resource's cost/sale rate.
  //   Actual Cost     = Σ ALL logged hours × cost rate     (billable + non-billable)
  //   Actual Revenue  = Σ billable hours × sale rate
  //   Actual Profit   = Actual Revenue − Actual Cost
  const stageActuals = (stageId: string) => {
    const s = stages.find((x) => x.id === stageId);
    if (!s) return { revenue: 0, cost: 0, profit: 0 };
    const logged = stageLoggedHours(stageId);
    const billable = stageBillableHours(stageId);
    if (logged <= 0 && billable <= 0) return { revenue: 0, cost: 0, profit: 0 };
    const planned = s.allocations.map((a) => ({
      h: allocationHours({
        start_date: a.start_date,
        end_date: a.end_date,
        hours_per_day: Number(a.hours_per_day),
      }),
      costRate: effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override),
      saleRate: effectiveSaleRate(a.resource.hourly_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override),
    }));
    const totPlan = planned.reduce((x, y) => x + y.h, 0);
    if (totPlan <= 0) return { revenue: 0, cost: 0, profit: 0 };
    let cost = 0;
    let revenue = 0;
    for (const p of planned) {
      const w = p.h / totPlan;
      cost += w * logged * p.costRate;
      revenue += w * billable * p.saleRate;
    }
    return { revenue, cost, profit: revenue - cost };
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
  const actualCost = actuals.cost + hist.cost;
  const actualProfit = actualRevenue - actualCost;
  const budgetUsedPct = totalBudget > 0 ? actualCost / totalBudget : 0;
  const budgetOver = actualCost > totalBudget && totalBudget > 0;

  // Invoiced total (excluding cancelled). This is a separate concept from
  // revenue — it's what has been BILLED to the client, not what has been earned.
  const invoicedTotal = (invoices ?? [])
    .filter((i) => i.status !== "cancelled")
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
  const setStatus = (status: "active" | "paused" | "archived") => {
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
              readOnly={!isAdmin}
              onRename={(name) =>
                updateProject.mutateAsync({ id: project.id, patch: { name } })
              }
            />
            <StatusBadge status={project.status} />
          </div>

          {/* MIDDLE: contextual meta — client · dates · team */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="truncate">
              {project.client ?? t("projects:detail.header.noClient")}
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(scheduleStart, "d MMM", { locale: pt })} – {format(scheduleEnd, "d MMM yyyy", { locale: pt })}
              {overdueDays > 0 ? (
                <span className="font-medium text-destructive">· {overdueDays}d</span>
              ) : (
                <span className="text-muted-foreground/70">· {remainingDays}d</span>
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
            <TabBtn icon={ActivityIcon} label="A&P" active={tab === "ap"} onClick={() => setTab("ap")} />
            <TabBtn icon={Package} label={t("projects:detail.tabs.materials")} active={tab === "materials"} onClick={() => setTab("materials")} />
            <TabBtn icon={Receipt} label={t("projects:detail.tabs.expenses")} active={tab === "expenses"} onClick={() => setTab("expenses")} />
            <TabBtn icon={FileText} label={t("projects:detail.tabs.billing")} active={tab === "billing"} onClick={() => setTab("billing")} />
            <TabBtn icon={Receipt} label="Financial" active={tab === "financial"} onClick={() => setTab("financial")} />
            {sourceQuoteId && (
              <>
                <TabBtn icon={CalendarIcon2} label="Planning" active={tab === "planning"} onClick={() => setTab("planning")} />
                <TabBtn icon={Building2} label="Architecture" active={tab === "architecture"} onClick={() => setTab("architecture")} />
                <TabBtn icon={UsersIcon} label="Suppliers" active={tab === "consultants"} onClick={() => setTab("consultants")} />
                <TabBtn icon={ArrowDownToLine} label="Incoming" active={tab === "incoming"} onClick={() => setTab("incoming")} />
                <TabBtn icon={ArrowUpFromLine} label="Outgoing" active={tab === "outgoing"} onClick={() => setTab("outgoing")} />
                <TabBtn icon={CalendarClock} label="Payment schedule" active={tab === "paymentSchedule"} onClick={() => setTab("paymentSchedule")} />
                <TabBtn icon={PieChartIcon} label="Financial summary" active={tab === "financialSummary"} onClick={() => setTab("financialSummary")} />
              </>
            )}
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
                    {t("projects:detail.sidebar.client", { defaultValue: "Client" })}
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
                <div className="text-sm font-medium text-foreground">
                  {project.client ?? t("projects:detail.header.noClient")}
                </div>

                <SidebarSection title={t("projects:detail.sidebar.details", { defaultValue: "Project details" })}>
                  <div className="space-y-1">
                    <DetailRow
                      label={t("projects:detail.sidebar.status", { defaultValue: "Status" })}
                      value={t(`projects:status.${project.status}`, { defaultValue: project.status })}
                    />
                    <DetailRow
                      label={t("projects:detail.sidebar.start", { defaultValue: "Start" })}
                      value={format(scheduleStart, "d MMM yyyy", { locale: pt })}
                    />
                    <DetailRow
                      label={t("projects:detail.sidebar.end", { defaultValue: "End" })}
                      value={format(scheduleEnd, "d MMM yyyy", { locale: pt })}
                    />
                    <DetailRow
                      label={overdueDays > 0
                        ? t("projects:detail.sidebar.overdue", { defaultValue: "Overdue" })
                        : t("projects:detail.sidebar.remaining", { defaultValue: "Remaining" })}
                      value={`${overdueDays > 0 ? overdueDays : remainingDays}d`}
                    />
                  </div>
                </SidebarSection>

                <SidebarSection title={t("projects:detail.sidebar.team")}>
                  {team.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t("projects:detail.sidebar.noTeam")}</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {team.map((r) => (
                        <Link
                          key={r.id}
                          to="/projects/resources/$resourceId"
                          params={{ resourceId: r.id }}
                          title={r.name}
                          className="rounded-full hover:opacity-80"
                        >
                          <CollaboratorAvatar
                            collaboratorId={(r as { collaborator_id?: string | null }).collaborator_id ?? null}
                            name={r.name}
                            color={r.color}
                            size={22}
                          />
                        </Link>
                      ))}
                    </div>
                  )}
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
                  <SidebarSection title={t("projects:detail.sidebar.notes", { defaultValue: "Notes" })}>
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
                  title={t("projects:detail.sidebar.team")}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground hover:bg-accent"
                >
                  {team.length}
                </button>
                {canSeeFinancials && (
                  <>
                    <button
                      onClick={() => setSidebarOpen(true)}
                      title={`${t("projects:detail.sidebar.budgetUsage")} · ${Math.round(budgetUsedPct * 100)}%`}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-[9px] font-mono font-medium hover:opacity-80",
                        budgetOver ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground",
                      )}
                    >
                      {Math.round(budgetUsedPct * 100)}%
                    </button>
                    <button
                      onClick={() => setSidebarOpen(true)}
                      title={`${t("projects:detail.sidebar.profit")} · ${euros(actualProfit)}`}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-[9px] font-mono font-medium hover:opacity-80",
                        actualProfit < 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground",
                      )}
                    >
                      {totalBudget > 0 ? `${Math.round((actualProfit / totalBudget) * 100)}%` : "—"}
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
                <ContractBaselineCard projectId={projectId} />
                {budgetControl && canSeeFinancials && (
                  <BudgetControlPanel
                    project={budgetControl.project}
                    byStage={budgetControl.byStage}
                    stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
                    showFinancials={canSeeFinancials}
                  />
                )}
                <RetainerMonitorPanel
                  stages={stages}
                  byStage={budgetControl?.byStage}
                  showFinancials={canSeeFinancials}
                />

                <div className="rounded-lg border border-border bg-card">
                  <MilestonesTable
                    stages={stages}
                    invoiced={invoicedTotal}
                    totalBudget={totalBudget}
                    stageCost={stageCost}
                    stageActualRevenue={stageActualRevenue}
                    stageActualCost={stageActualCost}
                    stageLoggedHours={stageLoggedHours}
                   stagePlannedHours={stagePlannedHours}
                    defaultRates={defaultRates}
                    canSeeFinancials={canSeeFinancials}
                    onEditPlan={() => setTab("schedule")}
                  />
                </div>
              </div>
            )}

            {tab === "ap" && (
              <div className="mt-4">
                <ProjectForecastCard projectId={projectId} />
              </div>
            )}

            {tab === "materials" && (
              <div className="mt-4">
                <ExternalServicesSection projectId={projectId} canEdit={isAdmin && canSeeFinancials} />
              </div>
            )}

            {tab === "expenses" && (
              <div className="mt-4">
                <ProjectExpensesSection projectId={projectId} canEdit={isAdmin && canSeeFinancials} />
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

            {tab === "billing" && (
              <div className="mt-4">
                <ProjectBillingTab projectId={projectId} />
              </div>
            )}

            {tab === "financial" && (
              <div className="mt-4">
                <ProjectFinancialTab projectId={projectId} />
              </div>
            )}

            {sourceQuoteId && tab === "planning" && (
              <div className="mt-4">
                <QuotePlanningTab quoteId={sourceQuoteId} pricingMultiplier={baselineMultiplier} />
              </div>
            )}
            {sourceQuoteId && tab === "architecture" && (
              <div className="mt-4 space-y-4">
                <QuotePaymentScheduleTab quoteId={sourceQuoteId} compositionOnly />
                <ArchitectureFinancialBreakdown quoteId={sourceQuoteId} />
              </div>
            )}
            {sourceQuoteId && tab === "consultants" && (
              <div className="mt-4">
                <QuotePaymentScheduleTab quoteId={sourceQuoteId} consultantsOnly />
              </div>
            )}
            {sourceQuoteId && tab === "incoming" && (
              <div className="mt-4">
                <QuotePaymentScheduleTab quoteId={sourceQuoteId} incomingOnly />
              </div>
            )}
            {sourceQuoteId && tab === "outgoing" && (
              <div className="mt-4">
                <QuotePaymentScheduleTab quoteId={sourceQuoteId} outgoingOnly />
              </div>
            )}
            {sourceQuoteId && tab === "paymentSchedule" && (
              <div className="mt-4">
                <QuotePaymentScheduleTab quoteId={sourceQuoteId} />
              </div>
            )}
            {sourceQuoteId && tab === "financialSummary" && (
              <div className="mt-4">
                <QuoteFinancialSummaryTab quoteId={sourceQuoteId} pricingMultiplier={baselineMultiplier} />
              </div>
            )}

            {tab === "schedule" && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showCancelled}
                      onChange={(e) => setShowCancelled(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    {t("projects:gantt.showCancelled", { defaultValue: "Show cancelled" })}
                  </label>
                </div>
                <ProjectGantt projectId={project.id} showCancelled={showCancelled} />
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
                defaultRates={defaultRates}
                activities={activities ?? []}
                historical={hist}
              />
            )}

            {tab === "stream" && (
              <div className="mt-4 space-y-3">
                {(activities ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                    Sem actividade registada neste projecto.
                  </div>
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
                            {a.author?.name ?? "Sistema"}
                          </span>
                          {a.stage && <span>· {a.stage.name}</span>}
                        </div>
                        <time>
                          {format(parseISO(a.created_at), "d MMM, HH:mm", {
                            locale: pt,
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
                          <Clock className="h-3 w-3" /> {a.logged_hours}h
                        </div>
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
      title={readOnly ? undefined : "Duplo clique para renomear"}
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
        : "bg-muted text-muted-foreground";
  const label =
    status === "active"
      ? t("projects:detail.status.active")
      : status === "paused"
        ? t("projects:detail.status.paused")
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
  onChange: (s: "active" | "paused" | "archived") => void;
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
          {format(date, "MMM", { locale: pt })}
        </span>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
          {label}
        </div>
        <div className="font-medium">
          {format(date, "d MMMM yyyy", { locale: pt })}
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
  stages,
  stageCost,
  stageActualRevenue,
  stageActualCost,
  stageLoggedHours,
  stagePlannedHours,
  defaultRates,
  canSeeFinancials,
  onEditPlan,
}: {
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
  defaultRates: ReturnType<typeof useDefaultResourceRates>["data"];
  canSeeFinancials: boolean;
  onEditPlan?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(stages?.map((s) => s.id) ?? []),
  );
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "empty">("all");
  const [search, setSearch] = useState("");

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
        <span>Adiciona uma fase para começar.</span>
        {onEditPlan && (
          <button
            onClick={onEditPlan}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova fase
          </button>
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
            aria-label={allExpanded ? "Colapsar tudo" : "Expandir tudo"}
            title={allExpanded ? "Colapsar tudo" : "Expandir tudo"}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            <span className="text-foreground/80">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "empty")}
              className="bg-transparent text-xs font-medium text-foreground outline-none"
            >
              <option value="all">Todos</option>
              <option value="active">Activas</option>
              <option value="empty">Sem alocação</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEditPlan}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Plan
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent">
            <Plus className="h-3.5 w-3.5" /> Add Task
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="h-8 w-44 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Milestones &amp; Tasks</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              {canSeeFinancials && (
                <>
                  <th
                    className="px-4 py-2.5 font-semibold"
                    title="Actual cost = Σ logged hours × cost rate. Compared to the stage budget when defined."
                  >
                    Cost (actual vs budget)
                  </th>
                  <th
                    className="px-4 py-2.5 font-semibold"
                    title="Revenue earned = Σ billable hours × sale rate"
                  >
                    Revenue (earned)
                  </th>
                  <th
                    className="px-4 py-2.5 font-semibold"
                    title="Profit = revenue − cost. Margin shown only when revenue > 0."
                  >
                    Profit / Margin
                  </th>
                </>
              )}
              <th className="px-4 py-2.5 font-semibold">Hours used / planned</th>
              <th className="px-4 py-2.5 font-semibold">Scheduled start</th>
              <th className="px-4 py-2.5 font-semibold">Scheduled due</th>
              <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const plannedCost = stageCost(s.id);
              const cost = stageActualCost(s.id);
              const revenue = stageActualRevenue(s.id);
              const budget = Number(s.budget);
              const over = cost > budget && budget > 0;
              const logged = stageLoggedHours(s.id);
              const planned = stagePlannedHours(s.id);
              void stageCost;
              const isOpen = expanded.has(s.id);
              const isActive = s.allocations.length > 0;
              void plannedCost;
              return (
                <Fragment key={s.id}>
                  <tr className="border-b border-border bg-muted/20 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggle(s.id)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={isOpen ? "Colapsar" : "Expandir"}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">
                            {i + 1}. {s.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {s.allocations.length === 0
                              ? "Sem responsável"
                              : `${s.allocations.length} alocaç${s.allocations.length === 1 ? "ão" : "ões"}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusDot active={isActive} label={isActive ? "Active" : "Planned"} />
                    </td>
                    {canSeeFinancials && (
                      <>
                        <td className="px-4 py-3 min-w-[200px] w-[18%]">
                          <CostVsBudgetCell cost={cost} budget={budget} over={over} />
                        </td>
                        <td className="px-4 py-3 min-w-[160px] w-[15%]">
                          <RevenueEarnedCell revenue={revenue} />
                        </td>
                        <td className="px-4 py-3 min-w-[160px] w-[15%]">
                          <ProfitMarginCell revenue={revenue} cost={cost} />
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <UsageBudgetCell logged={logged} planned={planned} over={over} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DateLink date={parseISO(s.start_date)} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DateLink date={parseISO(s.end_date)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1 text-muted-foreground">
                        <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Atribuir">
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Mais">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isOpen &&
                    s.allocations.map((a) => {
                      const aHours =
                        Math.max(0, dayDiffInclusive(a.start_date, a.end_date)) *
                        Number(a.hours_per_day);
                      const aPlannedCost =
                        aHours *
                        effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override);
                      const aPlannedRevenue =
                        aHours *
                        effectiveSaleRate(a.resource.hourly_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override);
                      return (
                        <tr key={a.id} className="border-b border-border last:border-b-0">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 pl-7">
                              <CollaboratorAvatar
                                collaboratorId={(a.resource as { collaborator_id?: string | null }).collaborator_id ?? null}
                                name={a.resource.name}
                                color={a.resource.color}
                                size={20}
                              />
                              <span className="truncate text-foreground">{a.resource.name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {Number(a.hours_per_day)}h/d
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusDot active label="Planned" />
                          </td>
                          {canSeeFinancials && (
                            <>
                              <td className="px-4 py-2.5 min-w-[200px]" title="Planned cost (allocation × cost rate)">
                                <PlannedAmountCell amount={aPlannedCost} label="planned" />
                              </td>
                              <td className="px-4 py-2.5 min-w-[160px]" title="Planned revenue (allocation × sale rate)">
                                <PlannedAmountCell amount={aPlannedRevenue} label="planned" />
                              </td>
                              <td className="px-4 py-2.5 min-w-[160px]" title="Planned profit = planned revenue − planned cost">
                                <PlannedAmountCell amount={aPlannedRevenue - aPlannedCost} label="planned" />
                              </td>
                            </>
                          )}
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <UsageBudgetCell logged={0} planned={aHours} over={false} />
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <DateLink date={parseISO(a.start_date)} />
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <DateLink date={parseISO(a.end_date)} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1 text-muted-foreground">
                              <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Atribuir">
                                <UserPlus className="h-3.5 w-3.5" />
                              </button>
                              <button className="rounded p-1 hover:bg-accent hover:text-foreground" aria-label="Mais">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
  defaultRates,
  activities,
  historical,
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
  defaultRates: ReturnType<typeof useDefaultResourceRates>["data"];
  activities: import("@/lib/projects/use-activities").Activity[];
  historical: HistoricalProjectTotals;
}) {
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
  for (const s of stages) {
    for (const a of s.allocations) {
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
      );
      const saleRate = effectiveSaleRate(
        a.resource.hourly_rate,
        a.resource.id,
        defaultRates,
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
  for (const s of stages) {
    const planned = s.allocations.map((a) => ({
      id: a.resource.id,
      h: allocationHours({
        start_date: a.start_date,
        end_date: a.end_date,
        hours_per_day: Number(a.hours_per_day),
      }),
      costRate: effectiveCostRate(a.resource.cost_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override),
      saleRate: effectiveSaleRate(a.resource.hourly_rate, a.resource.id, defaultRates, !!a.resource.hourly_rate_is_override),
    }));
    const totPlan = planned.reduce((x, y) => x + y.h, 0);
    const logged = stageLoggedHours(s.id);
    const billable = stageBillableHours(s.id);
    if (totPlan <= 0) continue;
    for (const p of planned) {
      const agg = byRes.get(p.id);
      if (!agg) continue;
      if (logged > 0) {
        const share = (p.h / totPlan) * logged;
        agg.loggedHours += share;
        // Cost from ALL logged hours (billable + non-billable on the project)
        loggedCostByRes.set(p.id, (loggedCostByRes.get(p.id) ?? 0) + share * p.costRate);
      }
      if (billable > 0) {
        // Revenue only from billable hours
        const billableShare = (p.h / totPlan) * billable;
        billableHoursByRes.set(
          p.id,
          (billableHoursByRes.get(p.id) ?? 0) + billableShare,
        );
        billableValueByRes.set(
          p.id,
          (billableValueByRes.get(p.id) ?? 0) + billableShare * p.saleRate,
        );
      }
    }
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
  const forecastValue = plannedRevenue > 0 ? plannedRevenue : earnedValue;
  const earnedPct = forecastValue > 0 ? earnedValue / forecastValue : 0;
  const forecastPct = forecastValue > 0 ? 1 : 0;

  // Profitability — actual vs forecast (using planned revenue & planned cost)
  const profitCurrent = actualProfit;
  const profitForecast = forecastValue - totalPlannedCost;
  const profitMarginCurrent =
    earnedValue > 0 ? Math.round((profitCurrent / earnedValue) * 100) : 0;
  const profitMarginForecast =
    forecastValue > 0 ? Math.round((profitForecast / forecastValue) * 100) : 0;

  const wipHours = Math.max(0, totalPlannedHours - totalLoggedHours);
  const workDonePct =
    totalPlannedHours > 0
      ? Math.min(1, totalLoggedHours / totalPlannedHours)
      : 0;
  const forecastDonePct = workDonePct;

  const monthMap = new Map<
    string,
    { key: string; label: string; activities: number; hours: number }
  >();
  for (const a of activities) {
    const d = parseISO(a.created_at);
    const key = format(d, "yyyy-MM");
    const label = format(d, "MMM yyyy", { locale: pt });
    const cur = monthMap.get(key) ?? {
      key,
      label,
      activities: 0,
      hours: 0,
    };
    cur.activities += 1;
    cur.hours += Number(a.logged_hours ?? 0);
    monthMap.set(key, cur);
  }
  const months = Array.from(monthMap.values()).sort((a, b) =>
    a.key < b.key ? -1 : 1,
  );
  const maxAct = Math.max(1, ...months.map((m) => m.activities));
  const maxHours = Math.max(1, ...months.map((m) => m.hours));

  // Financials box — Profit rule (locked):
  //   Profit = Budget (incoming / contracted fee) − Costs
  // The "Value" row is the hypothetical sale value of resources at sale rate
  // and is intentionally NOT used in the profit calculation.
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
  const externalRow = {
    budget: suppliersBudget,
    value: suppliersBudget,
    cost: fallbackExt.cost,
    profit: suppliersBudget - fallbackExt.cost,
    invoiced: 0,
  };

  const services = {
    budget: architectureBudget,
    value: earnedValue,
    cost: loggedCost,
    profit: architectureBudget - loggedCost,
    invoiced: invoicedTotal,
  };

  const projectExpensesQuery = useProjectExpenses(projectId);
  const expItems = projectExpensesQuery.data ?? [];
  const expensesRow = expItems.reduce(
    (acc, e) => {
      const cost = Number(e.purchase_price || 0);
      acc.cost += cost;
      return acc;
    },
    { budget: 0, value: 0, cost: 0, profit: 0, invoiced: 0 },
  );
  expensesRow.profit = expensesRow.budget - expensesRow.cost;
  const totalRow = {
    budget: services.budget + externalRow.budget + expensesRow.budget,
    value: services.value + externalRow.value + expensesRow.value,
    cost: services.cost + externalRow.cost + expensesRow.cost,
    profit: 0, // set below: Budget − Costs
    invoiced: services.invoiced,
  };
  totalRow.profit = totalRow.budget - totalRow.cost;


  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <InsightCard title="Activities vs. Hours">
          <ActivitiesHoursChart data={months} maxAct={maxAct} maxHours={maxHours} />
        </InsightCard>
        <InsightCard title="Revenue">
          <div className="space-y-4 px-1 pt-1">
            <BarRow
              label="Actual Revenue:"
              value={earnedValue}
              pct={earnedPct}
              over={earnedValue > forecastValue && forecastValue > 0}
            />
            <BarRow
              label="Planned Value (forecast):"
              value={forecastValue}
              pct={forecastPct}
              over={forecastValue < totalPlannedCost}
            />
          </div>
          <div className="mt-3 px-1 text-[10px] text-muted-foreground">
            Actual = billable hours × sale rate. Planned = total allocated hours × sale rate.
          </div>
        </InsightCard>
      </div>

      <InsightCard title="Profitability">
        <div className="grid gap-6 px-2 py-2 sm:grid-cols-2">
          <GaugeStat label="Current margin:" money={profitCurrent} pct={profitMarginCurrent} />
          <GaugeStat label="Forecast margin:" money={profitForecast} pct={profitMarginForecast} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 px-2 pb-3 text-xs">
          <HoursPill label="Billable" hours={totalBillableHours} tone="ok" />
          <HoursPill label="Non-billable" hours={totalNonBillableHours} tone="warn" />
          <HoursPill label="Total logged" hours={displayedLoggedHours} tone="muted" />
        </div>
        {historical.rowCount > 0 && (
          <div className="mx-2 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {historical.sources.join(", ") || "imported"}
            </Badge>
            <span>
              Includes {historical.rowCount} imported historical entr{historical.rowCount === 1 ? "y" : "ies"}
              {" · "}
              {Math.round(histLoggedHours)}h · {euros(historical.cost)} cost
            </span>
          </div>
        )}
      </InsightCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <InsightCard title="Financials">
          <FinancialsTable
            services={services}
            materials={externalRow}
            expenses={expensesRow}
            total={totalRow}
          />
        </InsightCard>
        <InsightCard title="Work">
          <div className="grid grid-cols-2 gap-4 px-2 py-2">
            <div className="flex flex-col items-center">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Work in progress
              </div>
              <Gauge value={wipHours} formatter={(v) => `${Math.round(v)}h`} pct={0} muted />
              <button className="mt-2 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
                View Tasks
              </button>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Work Done
              </div>
              <Gauge
                value={workDonePct * 100}
                formatter={(v) => `${Math.round(v)}%`}
                pct={workDonePct}
              />
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Forecast
              </div>
              <Gauge
                value={forecastDonePct * 100}
                formatter={(v) => `${Math.round(v)}%`}
                pct={forecastDonePct}
              />
            </div>
          </div>
        </InsightCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard title="Work Done">
          <ResourceBarList
            resources={resources}
            getValue={(r) =>
              r.plannedHours > 0 ? Math.min(1, r.loggedHours / r.plannedHours) : 0
            }
            getLabel={(r) => formatHm(r.loggedHours)}
            tone="ok"
          />
        </InsightCard>
        <InsightCard title="Budget">
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

      {invoices.length === 0 && (
        <div className="text-[10px] text-muted-foreground">
          Sem faturas — Earned Value usa apenas custos imputados.
        </div>
      )}

      <ExternalServicesSection projectId={projectId} canEdit={canEdit} />
      <ProjectExpensesSection projectId={projectId} canEdit={canEdit} />
    </div>
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
  maxAct,
  maxHours,
}: {
  data: { key: string; label: string; activities: number; hours: number }[];
  maxAct: number;
  maxHours: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        Sem actividade registada ainda.
      </div>
    );
  }
  const w = 100;
  const h = 220;
  const padX = 4;
  const innerW = w - padX * 2;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: padX + stepX * i,
    yH: h - (d.hours / maxHours) * (h - 30),
    yA: h - (d.activities / maxAct) * (h - 30),
  }));
  const areaPath =
    points.length > 0
      ? `M ${points[0].x},${h} ` +
        points.map((p) => `L ${p.x},${p.yH}`).join(" ") +
        ` L ${points[points.length - 1].x},${h} Z`
      : "";
  const linePath =
    points.length > 0
      ? `M ${points[0].x},${points[0].yH} ` +
        points.map((p) => `L ${p.x},${p.yH}`).join(" ")
      : "";
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h + 24}`}
        preserveAspectRatio="none"
        className="h-[240px] w-full"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={padX}
            x2={w - padX}
            y1={h - g * (h - 30)}
            y2={h - g * (h - 30)}
            stroke="var(--border)"
            strokeWidth={0.15}
            strokeDasharray="0.6,0.6"
          />
        ))}
        <path d={areaPath} fill="var(--color-budget-spent)" opacity="0.25" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-budget-spent)"
          strokeWidth={0.6}
        />
        {points.map((p, i) => {
          const barH = h - p.yA;
          return (
            <rect
              key={i}
              x={p.x - 1.6}
              y={p.yA}
              width={3.2}
              height={barH}
              fill="var(--primary)"
              opacity="0.85"
            />
          );
        })}
        {data.map((d, i) => (
          <text
            key={d.key}
            x={padX + stepX * i}
            y={h + 18}
            textAnchor="middle"
            fontSize="3"
            fill="var(--muted-foreground)"
          >
            {d.label}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-primary" /> Activities
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: "var(--color-budget-spent)" }}
          />{" "}
          Hours
        </span>
      </div>
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
        <span className="text-muted-foreground">({Math.round(pct * 100)}%)</span>
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
  const dash = Math.max(0, Math.min(1, Math.abs(pct))) * circ;
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
        {formatter(value)}
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
  const toneClass =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <div className={cn("rounded-md px-2 py-1.5", toneClass)}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="font-mono text-sm font-semibold">{Math.round(hours * 10) / 10}h</div>
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
  const rows: { label: string; key: keyof typeof services }[] = [
    { label: "Budget", key: "budget" },
    { label: "Value", key: "value" },
    { label: "Costs", key: "cost" },
    { label: "Profit", key: "profit" },
    { label: "Invoiced", key: "invoiced" },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <th className="px-2 py-2 text-left font-semibold"></th>
          <th className="px-2 py-2 font-semibold">Services</th>
          <th className="px-2 py-2 font-semibold">Suppliers</th>
          <th className="px-2 py-2 font-semibold">Expenses</th>
          <th className="px-2 py-2 font-semibold">Total</th>
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
  if (resources.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Sem alocações.
      </div>
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

function StatusDot({ active, label }: { active: boolean; label: string }) {
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
}: {
  cost: number;
  budget: number;
  over: boolean;
}) {
  const hasBudget = budget > 0;
  const pct = hasBudget ? Math.min(1, cost / budget) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-mono">
          <span className={over ? "text-destructive font-semibold" : "text-foreground"}>
            {euros(cost)}
          </span>
          {hasBudget ? (
            <span className="text-muted-foreground"> / {euros(budget)}</span>
          ) : (
            <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              no budget
            </span>
          )}
        </span>
        {hasBudget && (
          <span
            className={cn(
              "tabular-nums",
              over ? "text-destructive font-semibold" : "text-muted-foreground",
            )}
          >
            {Math.round(pct * 100)}%
          </span>
        )}
      </div>
      {hasBudget && (
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(100, pct * 100))}%`,
              backgroundColor: over ? "var(--color-budget-over)" : "var(--color-budget-spent)",
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
      <span className="font-mono text-foreground">{euros(revenue)}</span>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        earned
      </div>
    </div>
  );
}

/**
 * Profit + margin.
 *  - Profit = revenue − cost (always meaningful).
 *  - Margin shown only when revenue > 0 (otherwise denominator = 0).
 */
function ProfitMarginCell({ revenue, cost }: { revenue: number; cost: number }) {
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
      <span className={cn("font-mono font-semibold", tone)}>{euros(profit)}</span>
      {hasRevenue ? (
        <div className={cn("mt-0.5 text-[10px] tabular-nums", tone)}>
          {margin >= 0 ? "+" : ""}
          {margin.toFixed(1)}% margin
        </div>
      ) : (
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          no revenue yet
        </div>
      )}
    </div>
  );
}

/** Sub-row planned amount (allocation forecast). Dimmed to differentiate from actuals. */
function PlannedAmountCell({ amount, label }: { amount: number; label: string }) {
  return (
    <div className="text-xs">
      <span className={cn("font-mono", amount < 0 ? "text-destructive" : "text-muted-foreground")}>
        {euros(amount)}
      </span>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
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
  const noBudget = planned <= 0;
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className={over ? "text-destructive font-semibold" : "text-foreground"}>
        {formatHm(logged)}
      </span>
      <span className="text-muted-foreground">/</span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px]",
          noBudget || over
            ? "bg-destructive/15 text-destructive"
            : "bg-muted text-foreground",
        )}
      >
        {formatHm(planned)}
      </span>
    </div>
  );
}

function DateLink({ date }: { date: Date }) {
  return (
    <span className="text-xs text-foreground underline decoration-dotted decoration-muted-foreground/60 underline-offset-4">
      {format(date, "d MMM", { locale: pt })}
    </span>
  );
}

function dayDiffInclusive(start: string, end: string) {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
}

function formatHm(hours: number) {
  if (!Number.isFinite(hours)) return "0h 0m";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}
