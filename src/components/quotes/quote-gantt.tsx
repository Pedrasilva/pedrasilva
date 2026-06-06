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
import { useMemo, useState, useEffect, useRef, useLayoutEffect } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { addDays, differenceInCalendarDays } from "date-fns";
import { GanttChart, type StageWithProject, type PaymentMilestone } from "@/components/projects/gantt-chart";
import { ResourcePool } from "@/components/projects/resource-pool";
import { Button } from "@/components/ui/button";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
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

  const stages = stagesQ.data ?? [];
  const allocations = allocQ.data ?? [];

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

  // Map quote stages into StageWithProject. Quote stages have no baseline
  // columns; leave them undefined — features.baseline is off so Gantt won't
  // try to render the ghost.
  const mappedStages = useMemo<StageWithProject[]>(() => {
    return stages.map((s) => ({
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
      allocations: allocByStage.get(s.id) ?? [],
    }));
  }, [stages, allocByStage, quoteId]);

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
            embedded
          />
        </div>
        {!poolCollapsed && (
          <ResourcePool resources={poolResources} collapsed={false} missingRateIds={rateMissing} />
        )}
      </div>
    </div>
  );
}
