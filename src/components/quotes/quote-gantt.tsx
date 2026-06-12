/**
 * QuoteGantt — quote-mode wrapper around the shared GanttChart.
 *
 * Responsibilities
 * - Fetch quote_stages, quote_allocations, quote_stage_dependencies and
 *   active pm_resources.
 * - Map quote rows into the StageWithProject / AllocationWithResource shape
 *   GanttChart expects.
 *   - resource.hourly_rate is set to the allocation's sale_rate_snapshot,
 *     and resource.cost_rate to cost_rate_snapshot, so the Gantt's cost
 *     overlays read historical quote rates rather than the resource's
 *     current effective rates.
 * - Build a quote-mode PlannerAdapter (QUOTE_FEATURES) so baseline,
 *   leave overlap, overload, status toggle, holiday shading, and
 *   cross-project moves are hidden.
 */
import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { addDays, differenceInCalendarDays } from "date-fns";
import { GanttChart, type StageWithProject, type PaymentMilestone, type GanttHierarchyNode } from "@/components/projects/gantt-chart";
import { ResourcePool } from "@/components/projects/resource-pool";
import { Button } from "@/components/ui/button";
import { QuotePlannerInspector } from "@/components/quotes/quote-planner-inspector";
import { useQuoteStages, useUpsertQuoteStage } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuotePlannerAdapter } from "@/lib/quotes/use-quote-planner-adapter";
import { useQuotePlanningPool } from "@/lib/quotes/use-quote-planning-pool";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import type { Resource, AllocationWithResource } from "@/lib/projects/types";

interface Props {
  quoteId: string;
  dayWidth?: number;
}

type ZoomMode = "week" | "month" | "quarter" | "year" | "fit";

// Day widths per zoom level. Header granularity adapts to dayWidth
// (see GanttChart) so labels remain legible at every level.
const ZOOM_DAY_WIDTHS: Record<Exclude<ZoomMode, "fit">, number> = {
  week: 32,
  month: 10,
  quarter: 4,
  year: 1.5,
};

export function QuoteGantt({ quoteId, dayWidth: dayWidthProp }: Props) {
  const { t } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const allocQ = useQuoteAllocations(quoteId);

  // allResources: full active roster (needed so historical allocations
  // referencing archived/excluded users still render on the Gantt).
  // poolResources: filtered selectable Team Pool (drag source).
  // rateMissing: resources whose effective €/h could not be resolved.
  const { allResources, poolResources, rateMissing } = useQuotePlanningPool();
  const resources = allResources;

  const adapter = useQuotePlannerAdapter(quoteId, resources);
  const upsertStage = useUpsertQuoteStage(quoteId);

  const stages = stagesQ.data ?? [];
  const allocations = allocQ.data ?? [];

  /**
   * Inline rename from the outline column.
   *
   * Propagation rule: supplier_phase rows mirror the name of the architecture
   * stage they were spawned from. So when an architecture stage is renamed,
   * any supplier_phase row whose lineage points back to that architecture
   * and whose current name still matches the old architecture name is
   * renamed too — keeping the supplier-group summary subtree in sync.
   */
  const handleRename = useCallback(
    async (id: string, name: string) => {
      const target = stages.find((s) => s.id === id);
      if (!target) return;
      const oldName = target.name;
      await upsertStage.mutateAsync({ id, name });
      const role = (target as { stage_role?: string | null }).stage_role ?? "architecture";
      if (role !== "architecture") return;
      // Find supplier_groups whose parent is this arch, then phases under
      // them whose name still matches the previous arch name.
      const groupIds = stages
        .filter(
          (s) =>
            (s as { stage_role?: string | null }).stage_role === "supplier_group" &&
            (s as { parent_stage_id?: string | null }).parent_stage_id === id,
        )
        .map((s) => s.id);
      if (groupIds.length === 0) return;
      const mirrors = stages.filter(
        (s) =>
          (s as { stage_role?: string | null }).stage_role === "supplier_phase" &&
          groupIds.includes(
            (s as { parent_stage_id?: string | null }).parent_stage_id ?? "",
          ) &&
          s.name === oldName,
      );
      await Promise.all(
        mirrors.map((m) => upsertStage.mutateAsync({ id: m.id, name })),
      );
    },
    [stages, upsertStage],
  );

  /**
   * Inline WBS renumber — only the trailing segment is editable, so the
   * change is always a reorder within the same parent. We collect the
   * siblings sharing role + parent_stage_id, splice the target to the new
   * 1-based position, and rewrite sort_order sequentially.
   */
  const handleReorder = useCallback(
    async (id: string, newPosition: number) => {
      const target = stages.find((s) => s.id === id) as
        | (typeof stages)[number] & {
            stage_role?: string | null;
            parent_stage_id?: string | null;
          }
        | undefined;
      if (!target) return;
      const role = target.stage_role ?? "architecture";
      const parentId = target.parent_stage_id ?? null;
      const siblings = (stages as typeof stages & Array<{ stage_role?: string | null; parent_stage_id?: string | null }>)
        .filter(
          (s) =>
            ((s as { stage_role?: string | null }).stage_role ?? "architecture") === role &&
            ((s as { parent_stage_id?: string | null }).parent_stage_id ?? null) === parentId,
        )
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const without = siblings.filter((s) => s.id !== id);
      const clamped = Math.max(1, Math.min(newPosition, siblings.length));
      without.splice(clamped - 1, 0, target);
      // Write only rows whose sort_order changes.
      await Promise.all(
        without.map((s, i) => {
          const next = (i + 1) * 10;
          if ((s.sort_order ?? 0) === next) return Promise.resolve();
          return upsertStage.mutateAsync({ id: s.id, sort_order: next });
        }),
      );
    },
    [stages, upsertStage],
  );

  // Index resources for fast lookup when building per-allocation snapshots.
  const resourceById = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  );

  // Map quote allocations onto the AllocationWithResource shape, snapshotting
  // the rate fields from the quote row (so the Gantt cost overlay reflects
  // the rates actually quoted, not today's effective rates).
  const allocByStage = useMemo(() => {
    const m = new Map<string, AllocationWithResource[]>();
    for (const a of allocations) {
      const baseRes = resourceById.get(a.resource_id);
      if (!baseRes) continue;
      const resourceForAlloc: Resource = {
        ...baseRes,
        hourly_rate: Number(a.sale_rate_snapshot),
        sale_rate: Number(a.sale_rate_snapshot),
        cost_rate: Number(a.cost_rate_snapshot),
      };
      const mapped: AllocationWithResource = {
        id: a.id,
        stage_id: a.stage_id,
        resource_id: a.resource_id,
        start_date: a.start_date,
        end_date: a.end_date,
        hours_per_day: a.hours_per_day,
        // Quote allocations have no committed/tentative status — present as
        // 'committed' to satisfy the type and let the bar render normally.
        status: "committed",
        status_changed_at: null,
        created_at: a.created_at,
        updated_at: a.updated_at,
        source: null,
        is_locked: false,
        external_id: null,
        total_hours_imported: null,
        allocation_percentage: null,
        resource: resourceForAlloc,
      };
      const arr = m.get(a.stage_id) ?? [];
      arr.push(mapped);
      m.set(a.stage_id, arr);
    }
    return m;
  }, [allocations, resourceById]);

  // Map quote stages into StageWithProject + build the hierarchy descriptor
  // consumed by GanttChart's outline column.
  const { mappedStages, hierarchy } = useMemo<{
    mappedStages: StageWithProject[];
    hierarchy: Map<string, GanttHierarchyNode>;
  }>(() => {
    // Retainer-monthly stages (stage_kind='retainer_monthly') are edited via
    // RetainerStageEditor and intentionally NOT rendered on the main Gantt.
    const regular = stages.filter(
      (s) => (s as { stage_kind?: string }).stage_kind !== "retainer_monthly",
    );

    type S = (typeof regular)[number] & {
      stage_role?: string | null;
      parent_stage_id?: string | null;
      supplier_company_id?: string | null;
    };
    const all = regular as S[];
    const archStages = all
      .filter((s) => (s.stage_role ?? "architecture") === "architecture")
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const groupsByParent = new Map<string, S[]>();
    const phasesByParent = new Map<string, S[]>();
    for (const s of all) {
      const role = s.stage_role ?? "architecture";
      const parentId = s.parent_stage_id ?? null;
      if (role === "supplier_group" && parentId) {
        const arr = groupsByParent.get(parentId) ?? [];
        arr.push(s);
        groupsByParent.set(parentId, arr);
      } else if (role === "supplier_phase" && parentId) {
        const arr = phasesByParent.get(parentId) ?? [];
        arr.push(s);
        phasesByParent.set(parentId, arr);
      }
    }
    const orphanGroups = all.filter(
      (s) => (s.stage_role ?? "") === "supplier_group" && !s.parent_stage_id,
    );

    const ordered: S[] = [];
    const hier = new Map<string, GanttHierarchyNode>();
    let archIdx = 0;

    const pushGroup = (g: S, parentWbs: string, groupIdx: number) => {
      const wbs = parentWbs ? `${parentWbs}.${groupIdx}` : String(groupIdx);
      const phases = (phasesByParent.get(g.id) ?? []).sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      hier.set(g.id, {
        depth: parentWbs ? 1 : 0,
        wbs,
        hasChildren: phases.length > 0,
        isSummary: true,
        role: "supplier_group",
        parentId: g.parent_stage_id ?? null,
      });
      ordered.push(g);
      phases.forEach((p, pi) => {
        ordered.push(p);
        hier.set(p.id, {
          depth: parentWbs ? 2 : 1,
          wbs: `${wbs}.${pi + 1}`,
          hasChildren: false,
          isSummary: false,
          role: "supplier_phase",
          parentId: g.id,
        });
      });
    };

    for (const arch of archStages) {
      archIdx += 1;
      const groups = (groupsByParent.get(arch.id) ?? []).sort((a, b) =>
        (a.supplier_company_id ?? "").localeCompare(b.supplier_company_id ?? ""),
      );
      hier.set(arch.id, {
        depth: 0,
        wbs: String(archIdx),
        hasChildren: groups.length > 0,
        isSummary: false,
        role: "architecture",
        parentId: null,
      });
      ordered.push(arch);
      groups.forEach((g, gi) => pushGroup(g, String(archIdx), gi + 1));
    }
    orphanGroups.forEach((g, gi) => pushGroup(g, "", archStages.length + gi + 1));

    const mapped = ordered.map((s) => ({
      id: s.id,
      name: s.name,
      project_id: quoteId,
      projectId: quoteId,
      start_date: s.start_date,
      end_date: s.end_date,
      color: s.color,
      budget: s.budget,
      sort_order: s.sort_order,
      external_id: s.external_id ?? null,
      created_at: s.created_at,
      updated_at: s.updated_at,
      baseline_budget: null,
      baseline_end_date: null,
      baseline_locked_at: null,
      baseline_notes: null,
      baseline_start_date: null,
      baseline_target_hours: null,
      source: null,
      is_locked: false,
      source_contract_id: null,
      bootstrap_run_id: null,
      source_contract_phase_key: null,
      retainer_review_months: null,
      stage_kind: "regular",
      parent_stage_id: s.parent_stage_id ?? null,
      billing_model: "stage",
      retainer_monthly_amount: 0,
      retainer_anchor_month: null,
      retainer_months: null,
      retainer_capacity_hours_per_month: 160,
      is_fee_only: true,
      allocations: allocByStage.get(s.id) ?? [],
    }));

    return { mappedStages: mapped, hierarchy: hier };
  }, [stages, allocByStage, quoteId]);

  // Local collapse state for the outline. Persisted in sessionStorage per quote.
  const collapseKey = `quote-gantt-collapsed:${quoteId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.sessionStorage.getItem(collapseKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.sessionStorage.setItem(collapseKey, JSON.stringify([...next]));
      } catch {
        /* no-op */
      }
      return next;
    });
  };

  // Origin/totalDays — earliest start - 7d, span out to latest end + 21d.
  const { origin, totalDays } = useMemo(() => {
    if (!mappedStages.length) {
      return { origin: addDays(new Date(), -7), totalDays: 90 };
    }
    let minD = new Date(mappedStages[0].start_date);
    let maxD = new Date(mappedStages[0].end_date);
    for (const s of mappedStages) {
      const sd = new Date(s.start_date);
      const ed = new Date(s.end_date);
      if (sd < minD) minD = sd;
      if (ed > maxD) maxD = ed;
    }
    const o = addDays(minD, -7);
    const days = Math.max(60, differenceInCalendarDays(maxD, o) + 21);
    return { origin: o, totalDays: days };
  }, [mappedStages]);

  // Payment milestones — resolve each schedule item to a concrete date and €
  // amount using current stage dates and the sum of stage budgets as the
  // percent base. Recurring (monthly) items are skipped from the lane.
  const paymentsQ = useQuotePaymentSchedule(quoteId);
  const milestones = useMemo<PaymentMilestone[]>(() => {
    const items = paymentsQ.data ?? [];
    if (items.length === 0 || mappedStages.length === 0) return [];
    const stageById = new Map(mappedStages.map((s) => [s.id, s]));
    const earliestStart = mappedStages.reduce(
      (min, s) => (s.start_date < min ? s.start_date : min),
      mappedStages[0].start_date,
    );
    const totalValue = mappedStages.reduce((sum, s) => sum + Number(s.budget ?? 0), 0);
    const out: PaymentMilestone[] = [];
    for (const p of items) {
      let date: string | null = null;
      switch (p.trigger_type) {
        case "project_start":
          date = earliestStart;
          break;
        case "stage_start":
          date = p.stage_id ? stageById.get(p.stage_id)?.start_date ?? null : null;
          break;
        case "stage_end":
          date = p.stage_id ? stageById.get(p.stage_id)?.end_date ?? null : null;
          break;
        case "manual_date":
          date = p.expected_invoice_date ?? null;
          break;
        case "monthly":
        default:
          continue;
      }
      if (!date) continue;
      const amount =
        p.amount_type === "fixed"
          ? Number(p.amount_value)
          : (Number(p.amount_value) / 100) * totalValue;
      out.push({
        id: p.id,
        label: p.label,
        date,
        amount,
        status: "planned",
        note: p.notes ?? null,
      });
    }
    return out;
  }, [paymentsQ.data, mappedStages]);


  // Zoom — local UI state. Default to "week" (matches old detailed view).
  // If a parent forces dayWidth via prop, that wins (uncontrolled fallback only
  // when the prop is undefined).
  const [zoom, setZoom] = useState<ZoomMode>("week");
  const [poolCollapsed, setPoolCollapsed] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  // Measure chart container width so "Fit" stretches to fill it.
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(1100);
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const update = () => setChartWidth(el.clientWidth || 1100);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [poolCollapsed]);

  // Reset to "week" when switching quotes — avoids carrying over a fitted width
  // sized for a different quote's totalDays.
  useEffect(() => {
    setZoom("week");
  }, [quoteId]);

  const computedDayWidth = useMemo(() => {
    if (dayWidthProp !== undefined) return dayWidthProp;
    const target = Math.max(400, chartWidth - 24);
    const fitWidth = target / Math.max(1, totalDays);
    if (zoom === "fit") {
      return Math.max(1, Math.min(32, fitWidth));
    }
    // Ensure the chart always fills the available container width: never
    // shrink below what "fit" would use, even at compressed zoom levels.
    return Math.max(ZOOM_DAY_WIDTHS[zoom], fitWidth);
  }, [zoom, totalDays, dayWidthProp, chartWidth]);

  if (stagesQ.isLoading) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {t("workspace.planning.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  if (mappedStages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t("workspace.planning.noStages")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("workspace.planning.dragHelper", {
            defaultValue: "Drag resources into stages to build the fee.",
          })}
        </p>
        {dayWidthProp === undefined && (
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
            <span className="px-2 text-xs text-muted-foreground">
              {t("workspace.planning.zoomLabel", { defaultValue: "Zoom" })}
            </span>
            <Button
              type="button"
              variant={zoom === "week" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("week")}
            >
              {t("workspace.planning.zoomWeek", { defaultValue: "Week" })}
            </Button>
            <Button
              type="button"
              variant={zoom === "month" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("month")}
            >
              {t("workspace.planning.zoomMonth", { defaultValue: "Month" })}
            </Button>
            <Button
              type="button"
              variant={zoom === "quarter" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("quarter")}
            >
              {t("workspace.planning.zoomQuarter", { defaultValue: "Quarter" })}
            </Button>
            <Button
              type="button"
              variant={zoom === "year" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("year")}
            >
              {t("workspace.planning.zoomYear", { defaultValue: "Year" })}
            </Button>
            <Button
              type="button"
              variant={zoom === "fit" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("fit")}
            >
              {t("workspace.planning.zoomFit", { defaultValue: "Fit" })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPoolCollapsed((v) => !v)}
              aria-label={poolCollapsed ? "Expand team pool" : "Collapse team pool"}
              title={poolCollapsed ? "Expand team pool" : "Collapse team pool"}
            >
              {poolCollapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>
      <div className="flex overflow-hidden rounded-md border border-border bg-canvas">
        <div
          ref={chartRef}
          className="flex-1 overflow-auto resize-y"
          style={{ height: "70vh", minHeight: 320, maxHeight: "85vh" }}
        >
          <GanttChart
            projectId={quoteId}
            stages={mappedStages}
            origin={origin}
            totalDays={totalDays}
            dayWidth={computedDayWidth}
            resources={resources}
            adapter={adapter}
            milestones={milestones}
            hierarchy={hierarchy}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            outlineWidth={320}
            embedded
            selectedStageId={selectedStageId}
            onSelectStage={setSelectedStageId}
          />

        </div>
        {selectedStageId && (
          <QuotePlannerInspector
            quoteId={quoteId}
            stageId={selectedStageId}
            onClose={() => setSelectedStageId(null)}
          />
        )}
        {!poolCollapsed && !selectedStageId && (
          <ResourcePool resources={poolResources} collapsed={false} missingRateIds={rateMissing} />
        )}
      </div>
    </div>
  );
}
