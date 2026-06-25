/**
 * Stage 6D — Project operations cockpit.
 *
 * Additive workspace that composes Stage 6B baselines + Stage 6C forecast
 * envelope + existing pm_allocations into an operational view.
 *
 * Strict invariants:
 *  - Read-only with respect to data integrity. No bulk mutations.
 *  - All allocation editing flows go through the existing planner (Gantt).
 *  - Legacy projects degrade gracefully (empty-state card).
 *  - No AI, no auto-staffing — suggestions are deterministic and dismissible.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertTriangle, Users, Activity, Sparkles, Layers } from "lucide-react";
import { AppShell } from "@/components/projects/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectDetail, useResources } from "@/lib/projects/use-planner";
import {
  useProjectForecastEnvelope,
  suggestCollaboratorsForStage,
  type AllocationSuggestion,
} from "@/lib/project-forecasting";
import type {
  CollaboratorCapacity,
  PlaceholderRow,
  StageCoverage,
  StageRecoverability,
} from "@/lib/project-forecasting/types";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/projects/$projectId/allocations")({
  component: AllocationsWorkspace,
});

function fmtH(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Math.round(Number(n))}h`;
}
function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Math.round(Number(n))}%`;
}

type Severity = "ok" | "warn" | "bad";

function severityClass(s: Severity) {
  return s === "bad"
    ? "text-destructive"
    : s === "warn"
      ? "text-amber-600"
      : "text-emerald-600";
}
function severityDot(s: Severity) {
  return s === "bad"
    ? "bg-destructive"
    : s === "warn"
      ? "bg-amber-500"
      : "bg-emerald-500";
}

function coverageSeverity(pct: number): Severity {
  if (pct >= 90) return "ok";
  if (pct >= 60) return "warn";
  return "bad";
}
function marginSeverity(pct: number | null): Severity {
  if (pct == null) return "warn";
  if (pct >= 20) return "ok";
  if (pct >= 8) return "warn";
  return "bad";
}
function riskSeverity(level: "low" | "medium" | "high"): Severity {
  return level === "low" ? "ok" : level === "medium" ? "warn" : "bad";
}

function AllocationsWorkspace() {
  const { t } = useTranslation("crm");
  const { projectId } = Route.useParams();
  const { data: project } = useProjectDetail(projectId);
  const { data: allResources } = useResources();
  const { envelope, isLoading } = useProjectForecastEnvelope(projectId);

  // Resolve discipline per resource via the linked collaborator (HR layer).
  const collabIds = useMemo(
    () =>
      Array.from(
        new Set(
          (allResources ?? [])
            .map((r) => r.collaborator_id)
            .filter((id): id is string => !!id),
        ),
      ),
    [allResources],
  );
  const collabsQ = useQuery({
    enabled: collabIds.length > 0,
    queryKey: ["pm-cockpit-collab-disciplines", collabIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, departamento")
        .in("id", collabIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; departamento: string | null }>;
    },
  });
  const disciplineByResourceId = useMemo(() => {
    const roleByCollab = new Map<string, string>();
    for (const c of collabsQ.data ?? []) {
      if (c.departamento) roleByCollab.set(c.id, c.departamento);
    }
    const m = new Map<string, string>();
    for (const r of allResources ?? []) {
      if (r.collaborator_id) {
        const role = roleByCollab.get(r.collaborator_id);
        if (role) m.set(r.id, role);
      }
    }
    return m;
  }, [collabsQ.data, allResources]);

  if (isLoading || !project) {
    return (
      <AppShell active="projects">
        <div className="p-12 text-center text-sm text-muted-foreground">…</div>
      </AppShell>
    );
  }

  const stages = project.stages;
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const resourceById = new Map((allResources ?? []).map((r) => [r.id, r]));

  // --- Empty / degraded state ------------------------------------------------
  const hasSignal =
    !!envelope &&
    (envelope.metrics.allocated_hours > 0 ||
      envelope.metrics.planned_fee > 0 ||
      envelope.stageCoverages.some((c) => c.planned_hours > 0));

  return (
    <AppShell active="projects">
      <div className="w-full space-y-6 px-6 py-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-7">
              <Link to="/projects/$projectId" params={{ projectId }}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                {t("operations.backToProject")}
              </Link>
            </Button>
            <h1 className="font-display text-2xl font-semibold">
              {t("operations.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {project.project.name} — {t("operations.subtitle")}
            </p>
          </div>
        </div>

        {!hasSignal && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("operations.emptyTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("operations.emptyBody")}</p>
            </CardContent>
          </Card>
        )}

        {hasSignal && envelope && (
          <>
            <HealthHeader envelope={envelope} />

            <Tabs defaultValue="coverage">
              <TabsList>
                <TabsTrigger value="coverage">
                  <Layers className="mr-1.5 h-3.5 w-3.5" />
                  {t("operations.tabs.coverage")}
                </TabsTrigger>
                <TabsTrigger value="board">
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  {t("operations.tabs.board")}
                </TabsTrigger>
                <TabsTrigger value="conflicts">
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                  {t("operations.tabs.conflicts")}
                </TabsTrigger>
                <TabsTrigger value="suggestions">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {t("operations.tabs.suggestions")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="coverage" className="mt-4">
                <CoverageTable
                  stages={stages.map((s) => ({ id: s.id, name: s.name }))}
                  coverages={envelope.stageCoverages}
                  recoverabilities={envelope.stageRecoverabilities}
                />
              </TabsContent>

              <TabsContent value="board" className="mt-4">
                <AllocationBoard
                  projectId={projectId}
                  stages={stages.map((s) => ({ id: s.id, name: s.name }))}
                  allocations={stages.flatMap((s) =>
                    s.allocations.map((a) => ({
                      id: a.id,
                      stage_id: s.id,
                      resource_id: a.resource_id,
                      hours_per_day: Number(a.hours_per_day),
                      start_date: a.start_date,
                      end_date: a.end_date,
                    })),
                  )}
                  resourceById={resourceById}
                  capacities={envelope.collaboratorCapacities}
                />
              </TabsContent>

              <TabsContent value="conflicts" className="mt-4">
                <ConflictsView
                  envelope={envelope}
                  resourceById={resourceById}
                  stageById={stageById}
                />
              </TabsContent>

              <TabsContent value="suggestions" className="mt-4">
                <SuggestionsView
                  stages={stages}
                  resources={allResources ?? []}
                  capacities={envelope.collaboratorCapacities}
                  disciplineByResourceId={disciplineByResourceId}
                  projectId={projectId}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Operational health header                                                  */
/* -------------------------------------------------------------------------- */
function HealthHeader({
  envelope,
}: {
  envelope: NonNullable<ReturnType<typeof useProjectForecastEnvelope>["envelope"]>;
}) {
  const { t } = useTranslation("crm");
  const m = envelope.metrics;
  const staffing = coverageSeverity(m.staffing_coverage_pct);
  const margin = marginSeverity(m.forecast_margin_pct);
  const capacity = riskSeverity(m.capacity_risk_level);

  // Recoverability drift = avg(stage recoverability) - 100%
  const recAvg =
    envelope.stageRecoverabilities
      .map((r) => r.recoverability_pct)
      .filter((v): v is number => v != null)
      .reduce((a, b, _i, arr) => a + b / arr.length, 0);
  const recSev: Severity =
    recAvg >= 95 ? "ok" : recAvg >= 75 ? "warn" : "bad";

  const deliverySev: Severity =
    [staffing, margin, capacity, recSev].some((s) => s === "bad")
      ? "bad"
      : [staffing, margin, capacity, recSev].some((s) => s === "warn")
        ? "warn"
        : "ok";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("operations.health.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <HealthTile label={t("operations.health.staffing")} value={fmtPct(m.staffing_coverage_pct)} sev={staffing} />
          <HealthTile label={t("operations.health.margin")} value={fmtPct(m.forecast_margin_pct)} sev={margin} />
          <HealthTile label={t("operations.health.recoverability")} value={fmtPct(recAvg || null)} sev={recSev} />
          <HealthTile label={t("operations.health.capacity")} value={`${envelope.capacitySummary.overloaded}/${envelope.capacitySummary.total}`} sev={capacity} />
          <HealthTile label={t("operations.health.delivery")} value={t(`forecast.risk.${deliverySev === "ok" ? "low" : deliverySev === "warn" ? "medium" : "high"}`)} sev={deliverySev} />
        </div>
      </CardContent>
    </Card>
  );
}

function HealthTile({ label, value, sev }: { label: string; value: string; sev: Severity }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", severityDot(sev))} />
        {label}
      </div>
      <div className={cn("font-mono text-lg font-semibold", severityClass(sev))}>{value}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Coverage table                                                             */
/* -------------------------------------------------------------------------- */
function CoverageTable({
  stages,
  coverages,
  recoverabilities,
}: {
  stages: { id: string; name: string }[];
  coverages: StageCoverage[];
  recoverabilities: StageRecoverability[];
}) {
  const { t } = useTranslation("crm");
  const recBy = new Map(recoverabilities.map((r) => [r.project_stage_id, r]));
  const stageName = new Map(stages.map((s) => [s.id, s.name]));

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{t("operations.coverageTable.stage")}</th>
              <th className="px-3 py-2 text-right">{t("operations.coverageTable.planned")}</th>
              <th className="px-3 py-2 text-right">{t("operations.coverageTable.allocated")}</th>
              <th className="px-3 py-2 text-right">{t("operations.coverageTable.uncovered")}</th>
              <th className="px-3 py-2 text-right">{t("operations.coverageTable.coverage")}</th>
              <th className="px-3 py-2 text-right">{t("operations.coverageTable.recoverability")}</th>
              <th className="px-3 py-2 text-right">{t("operations.coverageTable.risk")}</th>
            </tr>
          </thead>
          <tbody>
            {coverages.map((c) => {
              const sev = coverageSeverity(c.staffing_coverage_pct);
              const rec = recBy.get(c.project_stage_id);
              return (
                <tr key={c.project_stage_id} className="border-t">
                  <td className="px-3 py-2">{stageName.get(c.project_stage_id) ?? c.project_stage_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtH(c.planned_hours)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtH(c.allocated_hours)}</td>
                  <td className={cn("px-3 py-2 text-right font-mono", c.remaining_hours > 0 && "text-amber-600")}>
                    {fmtH(c.remaining_hours)}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-mono", severityClass(sev))}>{fmtPct(c.staffing_coverage_pct)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtPct(rec?.recoverability_pct)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn("inline-flex h-2 w-2 rounded-full", severityDot(sev))} />
                  </td>
                </tr>
              );
            })}
            {coverages.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Allocation board: collaborators × stages matrix of hours                   */
/* -------------------------------------------------------------------------- */
function AllocationBoard({
  projectId,
  stages,
  allocations,
  resourceById,
  capacities,
}: {
  projectId: string;
  stages: { id: string; name: string }[];
  allocations: {
    id: string;
    stage_id: string;
    resource_id: string;
    hours_per_day: number;
    start_date: string;
    end_date: string;
  }[];
  resourceById: Map<string, { id: string; name: string; color: string } & Record<string, unknown>>;
  capacities: CollaboratorCapacity[];
}) {
  const { t } = useTranslation("crm");

  // Workdays helper (count Mon–Fri inclusive).
  function workdays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    let n = 0;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) n++;
    }
    return n;
  }

  type CellSum = number;
  const matrix = new Map<string, Map<string, CellSum>>(); // resource_id -> stage_id -> hours
  const totalByResource = new Map<string, number>();
  for (const a of allocations) {
    const hours = a.hours_per_day * workdays(a.start_date, a.end_date);
    if (!matrix.has(a.resource_id)) matrix.set(a.resource_id, new Map());
    const row = matrix.get(a.resource_id)!;
    row.set(a.stage_id, (row.get(a.stage_id) ?? 0) + hours);
    totalByResource.set(a.resource_id, (totalByResource.get(a.resource_id) ?? 0) + hours);
  }
  const utilByResource = new Map(capacities.map((c) => [c.resource_id, c]));

  const resourceIds = Array.from(matrix.keys()).sort((a, b) => {
    const na = (resourceById.get(a)?.name ?? "") as string;
    const nb = (resourceById.get(b)?.name ?? "") as string;
    return na.localeCompare(nb);
  });

  if (resourceIds.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {t("operations.board.noAllocations")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="overflow-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left">
                {t("operations.board.collaborator")}
              </th>
              {stages.map((s) => (
                <th key={s.id} className="px-3 py-2 text-right">
                  {s.name}
                </th>
              ))}
              <th className="px-3 py-2 text-right">{t("operations.board.total")}</th>
              <th className="px-3 py-2 text-right">{t("operations.board.utilization")}</th>
            </tr>
          </thead>
          <tbody>
            {resourceIds.map((rid) => {
              const r = resourceById.get(rid);
              const row = matrix.get(rid)!;
              const total = totalByResource.get(rid) ?? 0;
              const cap = utilByResource.get(rid);
              const utilSev: Severity = cap?.overloaded
                ? "bad"
                : (cap?.utilization_pct ?? 0) < 40
                  ? "warn"
                  : "ok";
              return (
                <tr key={rid} className="border-t">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: (r?.color as string) ?? "#888" }}
                      />
                      {(r?.name as string) ?? rid.slice(0, 8)}
                    </div>
                  </td>
                  {stages.map((s) => {
                    const v = row.get(s.id);
                    return (
                      <td key={s.id} className="px-3 py-2 text-right font-mono text-xs">
                        {v ? fmtH(v) : <span className="text-muted-foreground/40">·</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-mono font-medium">{fmtH(total)}</td>
                  <td className={cn("px-3 py-2 text-right font-mono", severityClass(utilSev))}>
                    {fmtPct(cap?.utilization_pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t bg-muted/20 px-3 py-2 text-right">
          <Button asChild variant="ghost" size="sm">
            <Link to="/projects/$projectId" params={{ projectId }}>
              {t("operations.board.openPlanner")} →
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Conflicts                                                                  */
/* -------------------------------------------------------------------------- */
function ConflictsView({
  envelope,
  resourceById,
  stageById,
}: {
  envelope: NonNullable<ReturnType<typeof useProjectForecastEnvelope>["envelope"]>;
  resourceById: Map<string, { id: string; name: string } & Record<string, unknown>>;
  stageById: Map<string, { id: string; name: string } & Record<string, unknown>>;
}) {
  const { t } = useTranslation("crm");

  const overloaded = envelope.collaboratorCapacities.filter((c) => c.overloaded);
  const underUtil = envelope.collaboratorCapacities.filter(
    (c) => c.capacity_hours > 0 && c.utilization_pct < 40,
  );
  const uncovered = envelope.stageCoverages.filter((c) => c.remaining_hours > 0);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ConflictCard
        title={t("operations.conflicts.overloadTitle")}
        empty={t("operations.conflicts.overloadEmpty")}
        items={overloaded.map((c) => ({
          key: c.resource_id,
          label: (resourceById.get(c.resource_id)?.name as string) ?? c.resource_id.slice(0, 8),
          detail: t("operations.conflicts.utilization", { pct: Math.round(c.utilization_pct) }),
          sev: "bad" as Severity,
        }))}
      />
      <ConflictCard
        title={t("operations.conflicts.uncoveredTitle")}
        empty={t("operations.conflicts.uncoveredEmpty")}
        items={uncovered.map((c) => ({
          key: c.project_stage_id,
          label:
            (stageById.get(c.project_stage_id)?.name as string) ??
            c.project_stage_id.slice(0, 8),
          detail: t("operations.conflicts.uncoveredHours", {
            hours: Math.round(c.remaining_hours),
          }),
          sev: "warn" as Severity,
        }))}
      />
      <ConflictCard
        title={t("operations.conflicts.underUtilTitle")}
        empty={t("operations.conflicts.underUtilEmpty")}
        items={underUtil.map((c) => ({
          key: c.resource_id,
          label: (resourceById.get(c.resource_id)?.name as string) ?? c.resource_id.slice(0, 8),
          detail: t("operations.conflicts.utilization", { pct: Math.round(c.utilization_pct) }),
          sev: "warn" as Severity,
        }))}
      />
    </div>
  );
}

function ConflictCard({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { key: string; label: string; detail: string; sev: Severity }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li
                key={i.key}
                className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-2 text-xs"
              >
                <span className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", severityDot(i.sev))} />
                  {i.label}
                </span>
                <span className={cn("font-mono", severityClass(i.sev))}>{i.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                */
/* -------------------------------------------------------------------------- */
function SuggestionsView({
  stages,
  resources,
  capacities,
  disciplineByResourceId,
  projectId,
}: {
  stages: { id: string; name: string; allocations: unknown[] }[];
  resources: NonNullable<ReturnType<typeof useResources>["data"]>;
  capacities: CollaboratorCapacity[];
  disciplineByResourceId: Map<string, string>;
  projectId: string;
}) {
  const { t } = useTranslation("crm");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Pull placeholders for these stages.
  const stageIds = stages.map((s) => s.id);
  const phQ = useQuery({
    enabled: stageIds.length > 0,
    queryKey: ["pm-cockpit-placeholders", projectId, stageIds.length],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_stage_allocation_placeholders")
        .select("*")
        .in("project_stage_id", stageIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as PlaceholderRow[];
    },
  });

  const capByResource = new Map(capacities.map((c) => [c.resource_id, c]));
  const placeholdersByStage = new Map<string, PlaceholderRow[]>();
  for (const p of phQ.data ?? []) {
    const arr = placeholdersByStage.get(p.project_stage_id) ?? [];
    arr.push(p);
    placeholdersByStage.set(p.project_stage_id, arr);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t("operations.suggestions.title")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("operations.suggestions.intro")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {stages.map((stage) => {
          if (dismissed.has(stage.id)) return null;
          const phList = placeholdersByStage.get(stage.id) ?? [];
          const placeholder = phList[0];
          const suggestions = suggestCollaboratorsForStage({
            stage: stage as unknown as Parameters<typeof suggestCollaboratorsForStage>[0]["stage"],
            placeholder,
            resources,
            capacityByResourceId: capByResource,
            disciplineByResourceId,
          }).slice(0, 5);

          return (
            <div key={stage.id} className="rounded-md border bg-muted/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">{stage.name}</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => setDismissed((s) => new Set(s).add(stage.id))}
                >
                  ✕
                </Button>
              </div>
              {!placeholder && (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {t("operations.suggestions.noPlaceholder")}
                </p>
              )}
              <ul className="space-y-1.5">
                {suggestions.map((s: AllocationSuggestion) => (
                  <li
                    key={s.resource_id}
                    className="flex items-center justify-between rounded-md border bg-card px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{s.resource_name}</span>
                      {s.discipline_match && (
                        <Badge variant="secondary" className="h-4 text-[10px]">
                          {t("operations.suggestions.match")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        {s.available_hours > 0
                          ? t("operations.suggestions.available", { hours: Math.round(s.available_hours) })
                          : t("operations.suggestions.loaded", { pct: Math.round(s.current_utilization_pct) })}
                      </span>
                      <span className="font-mono">{t("operations.suggestions.score", { score: s.score })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
