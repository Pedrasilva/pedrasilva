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
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { addDays, differenceInCalendarDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GanttChart, type StageWithProject } from "@/components/projects/gantt-chart";
import { ResourcePool } from "@/components/projects/resource-pool";
import { Button } from "@/components/ui/button";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuotePlannerAdapter } from "@/lib/quotes/use-quote-planner-adapter";
import type { Resource, AllocationWithResource } from "@/lib/projects/types";

interface Props {
  quoteId: string;
  dayWidth?: number;
}

type ZoomMode = "week" | "month" | "fit";

// Day widths chosen so that:
//   week  → ~32px/day (detailed planning, default)
//   month → ~10px/day (compact, multi-month overview)
//   fit   → computed from totalDays so the whole quote fits in ~1100px
const ZOOM_DAY_WIDTHS: Record<Exclude<ZoomMode, "fit">, number> = {
  week: 32,
  month: 10,
};

export function QuoteGantt({ quoteId, dayWidth: dayWidthProp }: Props) {
  const { t } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const allocQ = useQuoteAllocations(quoteId);

  // Full Resource rows (need cost_rate / sale_rate / collaborator_id / role
  // for Gantt's tooltip + avatar rendering).
  const { data: resources = [] } = useQuery({
    queryKey: ["pm-resources-active-full"],
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await supabase
        .from("pm_resources")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Resource[];
    },
  });

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

  // Zoom — local UI state. Default to "week" (matches old detailed view).
  // If a parent forces dayWidth via prop, that wins (uncontrolled fallback only
  // when the prop is undefined).
  const [zoom, setZoom] = useState<ZoomMode>("week");

  // Reset to "week" when switching quotes — avoids carrying over a fitted width
  // sized for a different quote's totalDays.
  useEffect(() => {
    setZoom("week");
  }, [quoteId]);

  const computedDayWidth = useMemo(() => {
    if (dayWidthProp !== undefined) return dayWidthProp;
    if (zoom === "fit") {
      // Aim to fit the whole quote into ~1100px of timeline real estate.
      const target = 1100;
      const w = Math.floor(target / Math.max(1, totalDays));
      // Clamp so bars stay readable (min 4px/day) but don't get absurdly wide
      // for tiny quotes (max 32px/day = same as week).
      return Math.max(4, Math.min(32, w));
    }
    return ZOOM_DAY_WIDTHS[zoom];
  }, [zoom, totalDays, dayWidthProp]);

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
              variant={zoom === "fit" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("fit")}
            >
              {t("workspace.planning.zoomFit", { defaultValue: "Fit" })}
            </Button>
          </div>
        )}
      </div>
      <div className="flex overflow-hidden rounded-md border border-border bg-canvas">
        <div className="flex-1 overflow-auto">
          <GanttChart
            projectId={quoteId}
            stages={mappedStages}
            origin={origin}
            totalDays={totalDays}
            dayWidth={computedDayWidth}
            resources={resources}
            adapter={adapter}
            embedded
          />
        </div>
        <ResourcePool resources={resources} collapsed={false} />
      </div>
    </div>
  );
}
