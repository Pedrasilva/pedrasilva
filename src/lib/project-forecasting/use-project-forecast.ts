/**
 * Stage 6C — React hook that computes the full project forecast envelope
 * on-the-fly from existing PM data + Stage 6B baselines.
 *
 * Read-only by default. Persisting snapshots into pm_stage_capacity_snapshots
 * or pm_project_forecast_metrics is exposed as an explicit mutation so the
 * caller decides when to freeze a snapshot.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  distributeAllAllocations,
  totalAllocatedHoursByResource,
  totalAllocatedHoursByStage,
} from "./allocation-forecast";
import { computeStageCoverage, aggregateCoverage } from "./staffing-coverage";
import { computeStageRecoverability } from "./recoverability";
import { computeResourceCapacity, summarizeCapacity } from "./capacity";
import { computeProjectForecastMetrics } from "./project-metrics";
import type {
  AllocationRow,
  CollaboratorCapacity,
  PlaceholderRow,
  ProjectBaselineRow,
  ProjectForecastMetrics,
  ResourceRow,
  StageBaselineRow,
  StageCoverage,
  StageRecoverability,
  StageRow,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ProjectForecastEnvelope {
  stageCoverages: StageCoverage[];
  stageRecoverabilities: StageRecoverability[];
  collaboratorCapacities: CollaboratorCapacity[];
  metrics: ProjectForecastMetrics;
  capacitySummary: ReturnType<typeof summarizeCapacity>;
  coverageSummary: ReturnType<typeof aggregateCoverage>;
}

export function useProjectForecastEnvelope(projectId: string | null | undefined) {
  // Fetch stages + allocations + resources + baselines + placeholders.
  const stagesQ = useQuery<StageRow[]>({
    enabled: !!projectId,
    queryKey: ["pm-stages-for-forecast", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("pm_stages")
        .select("*")
        .eq("project_id", projectId);
      if (error) throw new Error(error.message);
      return (data ?? []) as StageRow[];
    },
  });

  const stageIds = (stagesQ.data ?? []).map((s) => s.id);

  const allocsQ = useQuery<AllocationRow[]>({
    enabled: stageIds.length > 0,
    queryKey: ["pm-allocations-for-forecast", projectId, stageIds.length],
    queryFn: async () => {
      const { data, error } = await db
        .from("pm_allocations")
        .select("*")
        .in("stage_id", stageIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as AllocationRow[];
    },
  });

  const resourceIds = Array.from(
    new Set((allocsQ.data ?? []).map((a) => a.resource_id)),
  );
  const resourcesQ = useQuery<ResourceRow[]>({
    enabled: resourceIds.length > 0,
    queryKey: ["pm-resources-for-forecast", resourceIds],
    queryFn: async () => {
      const { data, error } = await db
        .from("pm_resources")
        .select("*")
        .in("id", resourceIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as ResourceRow[];
    },
  });

  const projBaselineQ = useQuery<ProjectBaselineRow | null>({
    enabled: !!projectId,
    queryKey: ["pm-project-baseline-for-forecast", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("pm_project_commercial_baselines")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ProjectBaselineRow | null;
    },
  });

  const stageBaselinesQ = useQuery<StageBaselineRow[]>({
    enabled: !!projectId,
    queryKey: ["pm-stage-baselines-for-forecast", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("pm_stage_commercial_baselines")
        .select("*")
        .eq("project_id", projectId);
      if (error) throw new Error(error.message);
      return (data ?? []) as StageBaselineRow[];
    },
  });

  const placeholdersQ = useQuery<PlaceholderRow[]>({
    enabled: stageIds.length > 0,
    queryKey: ["pm-placeholders-for-forecast", stageIds],
    queryFn: async () => {
      const { data, error } = await db
        .from("pm_stage_allocation_placeholders")
        .select("*")
        .in("project_stage_id", stageIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as PlaceholderRow[];
    },
  });

  const envelope = useMemo<ProjectForecastEnvelope | null>(() => {
    if (!projectId || !stagesQ.data) return null;
    const stages = stagesQ.data;
    const allocs = allocsQ.data ?? [];
    const resources = resourcesQ.data ?? [];
    const baselines = stageBaselinesQ.data ?? [];
    const placeholders = placeholdersQ.data ?? [];

    const stagesById = new Map(stages.map((s) => [s.id, s]));
    const resourcesById = new Map(resources.map((r) => [r.id, r]));
    const baselineByStageId = new Map(
      baselines.map((b) => [b.project_stage_id, b]),
    );

    const daily = distributeAllAllocations(allocs, stagesById, resourcesById);
    const allocByStage = totalAllocatedHoursByStage(daily);
    const allocByResource = totalAllocatedHoursByResource(daily);

    const stageCoverages = stages.map((s) =>
      computeStageCoverage(s.id, baselineByStageId.get(s.id), placeholders, allocByStage),
    );
    const stageRecoverabilities = stages.map((s) =>
      computeStageRecoverability(s, baselineByStageId.get(s.id), allocs, resourcesById),
    );

    // Compute capacity over the smallest enclosing window of all allocations.
    let winStart: string | null = null;
    let winEnd: string | null = null;
    for (const a of allocs) {
      if (!winStart || a.start_date < winStart) winStart = a.start_date;
      if (!winEnd || a.end_date > winEnd) winEnd = a.end_date;
    }
    const collaboratorCapacities: CollaboratorCapacity[] =
      winStart && winEnd
        ? resources.map((r) =>
            computeResourceCapacity(r, allocByResource.get(r.id) ?? 0, {
              start: winStart!,
              end: winEnd!,
            }),
          )
        : [];
    const capacitySummary = summarizeCapacity(collaboratorCapacities);
    const coverageSummary = aggregateCoverage(stageCoverages);

    const metrics = computeProjectForecastMetrics({
      project_id: projectId,
      baseline: projBaselineQ.data ?? null,
      stageCoverages,
      stageRecoverabilities,
      overloadedCollaboratorsCount: capacitySummary.overloaded,
    });

    return {
      stageCoverages,
      stageRecoverabilities,
      collaboratorCapacities,
      metrics,
      capacitySummary,
      coverageSummary,
    };
  }, [
    projectId,
    stagesQ.data,
    allocsQ.data,
    resourcesQ.data,
    projBaselineQ.data,
    stageBaselinesQ.data,
    placeholdersQ.data,
  ]);

  return {
    envelope,
    isLoading:
      stagesQ.isLoading ||
      allocsQ.isLoading ||
      resourcesQ.isLoading ||
      stageBaselinesQ.isLoading ||
      placeholdersQ.isLoading,
  };
}

/* -------------------------------------------------------------------------- */
/* Snapshot persistence (explicit; never automatic)                           */
/* -------------------------------------------------------------------------- */

export function useFreezeProjectForecastSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { envelope: ProjectForecastEnvelope }) => {
      const m = input.envelope.metrics;

      const { error: pmErr } = await db
        .from("pm_project_forecast_metrics")
        .insert({
          project_id: m.project_id,
          planned_fee: m.planned_fee,
          forecast_fee: m.forecast_fee,
          planned_cost: m.planned_cost,
          forecast_cost: m.forecast_cost,
          planned_margin_pct: m.planned_margin_pct,
          forecast_margin_pct: m.forecast_margin_pct,
          allocated_hours: m.allocated_hours,
          remaining_hours: m.remaining_hours,
          staffing_coverage_pct: m.staffing_coverage_pct,
          capacity_risk_level: m.capacity_risk_level,
        });
      if (pmErr) throw new Error(pmErr.message);

      // Per-stage snapshots
      const recByStage = new Map(
        input.envelope.stageRecoverabilities.map((r) => [r.project_stage_id, r]),
      );
      const rows = input.envelope.stageCoverages.map((c) => {
        const r = recByStage.get(c.project_stage_id);
        return {
          project_stage_id: c.project_stage_id,
          planned_hours: c.planned_hours,
          allocated_hours: c.allocated_hours,
          remaining_hours: c.remaining_hours,
          planned_revenue: r?.sold_fee ?? null,
          planned_cost: r?.planned_cost ?? null,
          planned_margin_pct: r?.planned_margin_pct ?? null,
          staffing_coverage_pct: c.staffing_coverage_pct,
          recoverability_pct: r?.recoverability_pct ?? null,
        };
      });
      if (rows.length) {
        const { error } = await db
          .from("pm_stage_capacity_snapshots")
          .insert(rows);
        if (error) throw new Error(error.message);
      }

      return { project_id: m.project_id };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({
        queryKey: ["pm-project-forecast-metrics", res.project_id],
      });
    },
  });
}
