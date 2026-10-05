import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { euros } from "@/lib/projects/gantt-utils";
import { useResources } from "@/lib/projects/use-planner";
import { effectiveCostRate, useDefaultResourceRates } from "@/lib/projects/use-default-rates";
import { buildStageNumberMap } from "@/lib/quotes/stage-numbering";
import { useTeamPricingAverages } from "@/lib/quotes/use-team-pricing-averages";
import { stagePlannedHours } from "@/lib/projects/stage-load-estimate";
import { stageActuals, type StageLite } from "@/lib/reports/budget-consumption";
import {
  ESTIMATE_SOURCES,
  PHASE_TYPES,
  overrun,
  resolvePhaseType,
  type EstimateSource,
  summarise,
  toStageRow,
  type PhaseType,
  type StageRow,
} from "@/lib/reports/estimate-vs-actual";
import { useEstimateVsActualData, type EvaStage } from "@/lib/reports/use-estimate-vs-actual";

export const Route = createFileRoute("/_app/reports/estimates")({
  head: () => ({
    meta: [
      { title: "Estimate vs actual by phase — PSA Hub Reports" },
      { name: "description", content: "Planned vs actual hours, cost and duration per phase type, from stage baselines." },
      { property: "og:title", content: "Estimate vs actual by phase — PSA Hub Reports" },
      { property: "og:description", content: "Planned vs actual hours, cost and duration per phase type, from stage baselines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EstimatesPage,
});

const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n)}%`);
const h0 = (n: number | null) => (n == null ? "—" : `${Math.round(n)} h`);
const d0 = (n: number | null) => (n == null ? "—" : `${Math.round(n)} d`);
const tone = (n: number | null) => (n == null ? "" : n > 10 ? "text-destructive" : n < -10 ? "text-emerald-600 dark:text-emerald-400" : "");

type View = { kind: "type"; type: PhaseType } | { kind: "missing" } | { kind: "unmapped" } | null;

function EstimatesPage() {
  const { t } = useTranslation("reports");
  const { data, isLoading, error } = useEstimateVsActualData();
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const [status, setStatus] = useState("all");
  const [client, setClient] = useState("all");
  const [ptype, setPtype] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyDone, setOnlyDone] = useState(false);
  const [source, setSource] = useState("all");
  const { data: teamAvg } = useTeamPricingAverages();
  const avgSale = teamAvg?.avgSalePerHour ?? 0;
  const [view, setView] = useState<View>(null);

  const resById = useMemo(() => new Map((resources ?? []).map((r) => [r.id, r])), [resources]);

  const base = useMemo(() => {
    if (!data) return null;
    const projById = new Map(data.projects.map((p) => [p.id, p]));
    const own = data.stages.filter((s) => s.is_self !== false);
    const hasChildren = new Set(data.stages.map((s) => s.parent_stage_id).filter(Boolean) as string[]);
    const byId = new Map(data.stages.map((s) => [s.id, s]));
    const numbers = new Map<string, string>();
    const byProject = new Map<string, EvaStage[]>();
    for (const s of data.stages) byProject.set(s.project_id, [...(byProject.get(s.project_id) ?? []), s]);
    for (const list of byProject.values()) for (const [k, v] of buildStageNumberMap(list as never)) numbers.set(k, v);
    const stageById = new Map(own.map((s) => [s.id, { id: s.id, project_id: s.project_id, billing_model: s.billing_model, allocations: s.pm_allocations ?? [] } as StageLite]));
    const actuals = stageActuals({
      entries: data.entries,
      taskToStage: data.taskToStage,
      stageById,
      costRateFor: (rid) => {
        const r = resById.get(rid);
        return effectiveCostRate(r?.cost_rate, rid, defaultRates, !!r?.hourly_rate_is_override);
      },
      saleRateFor: () => 0,
    });
    const typeOf = (s: EvaStage): PhaseType | null =>
      resolvePhaseType(s, (x) => (x.parent_stage_id ? byId.get(x.parent_stage_id) : undefined));
    /** First available wins: sold quote stage → current plan → locked baseline. */
    const estimateOf = (s: EvaStage): { source: EstimateSource | null; hours: number | null; cost: number | null } => {
      const pos = (n: number | null | undefined) => (n != null && Number(n) > 0 ? Number(n) : null);
      if (s.source_quote_stage_id) {
        const h = pos(data.quoteHours.get(s.source_quote_stage_id));
        const c = pos(s.quote_stages?.budget);
        if (h != null || c != null) return { source: "quote", hours: h, cost: c };
      }
      const planH = pos(stagePlannedHours({ allocations: s.pm_allocations ?? [], budget: s.budget, avgSaleRate: avgSale }));
      const planC = pos(s.budget);
      if (planH != null || planC != null) return { source: "plan", hours: planH, cost: planC };
      if (s.baseline_locked_at) {
        const h = pos(s.baseline_target_hours), c = pos(s.baseline_budget);
        if (h != null || c != null) return { source: "baseline", hours: h, cost: c };
      }
      return { source: null, hours: null, cost: null };
    };
    // Leaf stages only, so a parent's roll-up is never counted twice.
    const rows: (StageRow & { client: string; projectStatus: string })[] = own
      .filter((s) => !hasChildren.has(s.id))
      .map((s) => {
        const p = projById.get(s.project_id);
        const a = actuals.get(s.id);
        const num = numbers.get(s.id);
        const est = estimateOf(s);
        return {
          ...toStageRow({
            id: s.id,
            name: s.name,
            label: num ? `${num} ${s.name}` : s.name,
            projectId: s.project_id,
            projectName: p?.name ?? "—",
            status: s.status,
            plannedHours: est.hours,
            plannedCost: est.cost,
            source: est.source,
            actualHours: a?.loggedHours ?? 0,
            actualCost: a?.laborCost ?? 0,
            actualValue: (a?.loggedHours ?? 0) * avgSale,
            baselineStart: s.baseline_start_date,
            baselineEnd: s.baseline_end_date,
            start: s.start_date,
            end: s.end_date,
            phaseType: typeOf(s),
          }),
          client: p?.client ?? "",
          projectStatus: p?.status ?? "active",
        };
      });
    return rows;
  }, [data, resById, defaultRates, avgSale]);

  const clients = useMemo(() => [...new Set((base ?? []).map((r) => r.client).filter(Boolean))].sort(), [base]);

  const filtered = useMemo(
    () =>
      (base ?? []).filter((r) => {
        if (status !== "all" && r.projectStatus !== status) return false;
        if (client !== "all" && r.client !== client) return false;
        if (ptype !== "all" && r.phaseType !== ptype) return false;
        if (onlyDone && r.status !== "done") return false;
        if (source !== "all" && r.source !== source) return false;
        if (from && (!r.end || r.end < from)) return false;
        if (to && (!r.end || r.end > to)) return false;
        return true;
      }),
    [base, status, client, ptype, onlyDone, from, to, source],
  );
  const hasEstimate = (r: StageRow) => (r.plannedHours ?? 0) > 0 || (r.plannedCost ?? 0) > 0;
  const missing = filtered.filter((r) => !((r.plannedHours ?? 0) > 0));
  const scoped = filtered.filter(hasEstimate);
  const unmapped = filtered.filter((r) => !r.phaseType);
  const summary = useMemo(() => summarise(scoped), [scoped]);
  const chart = summary.filter((s) => s.median != null).map((s) => ({ type: s.type, label: t(`estimates.types.${s.type}`), median: Math.round(s.median ?? 0) }));

  const drill: StageRow[] =
    view?.kind === "type" ? summary.find((s) => s.type === view.type)?.stages ?? [] : view?.kind === "missing" ? missing : view?.kind === "unmapped" ? unmapped : [];

  return (
    <V2PermissionGate permission="reports.view" scope="all">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("estimates.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("estimates.subtitle")}</p>
          <p className="text-xs text-muted-foreground">{t("estimates.likeForLikeHint")}</p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <Field label={t("estimates.filters.status")}>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["all", "active", "closing", "archived"].map((s) => (
                    <SelectItem key={s} value={s}>{t(`estimates.status.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("estimates.filters.client")}>
              <Select value={client} onValueChange={setClient}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("estimates.filters.all")}</SelectItem>
                  {clients.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("estimates.filters.phaseType")}>
              <Select value={ptype} onValueChange={setPtype}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("estimates.filters.all")}</SelectItem>
                  {PHASE_TYPES.map((p) => <SelectItem key={p} value={p}>{t(`estimates.types.${p}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("estimates.filters.source")}>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("estimates.filters.all")}</SelectItem>
                  {ESTIMATE_SOURCES.map((x) => <SelectItem key={x} value={x}>{t(`estimates.sources.${x}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("estimates.filters.endFrom")}><Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={t("estimates.filters.endTo")}><Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="only-done" checked={onlyDone} onCheckedChange={setOnlyDone} />
              <Label htmlFor="only-done">{t("estimates.filters.onlyDone")}</Label>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <p className="text-sm text-destructive">{t("estimates.error")}</p>
        ) : isLoading || !base ? (
          <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /></div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              {missing.length > 0 && (
                <button type="button" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-800 underline-offset-2 hover:underline dark:text-amber-300" onClick={() => setView({ kind: "missing" })}>
                  {t("estimates.missing", { count: missing.length })}
                </button>
              )}
              {unmapped.length > 0 && (
                <button type="button" className="rounded-md border px-3 py-2 text-muted-foreground underline-offset-2 hover:underline" onClick={() => setView({ kind: "unmapped" })}>
                  {t("estimates.unmapped", { count: unmapped.length })}
                </button>
              )}
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">{t("estimates.chartTitle")}</CardTitle></CardHeader>
              <CardContent>
                {chart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("estimates.empty")}</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                        <ReferenceLine y={0} className="stroke-foreground" />
                        <Tooltip formatter={(v: number) => pct(v)} />
                        <Bar dataKey="median" name={t("estimates.cols.median")}>
                          {chart.map((c) => <Cell key={c.type} className={c.median > 0 ? "fill-destructive" : "fill-primary"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{t("estimates.tableTitle")}</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("estimates.cols.type")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.stages")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.plannedH")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.actualH")}</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.plannedC")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.actualC")}</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.psaCost")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.consumed")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.best")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.median")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.worst")}</TableHead>
                      <TableHead className="text-right">{t("estimates.cols.duration")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map((s) => (
                      <TableRow key={s.type} className={cn(s.count > 0 && "cursor-pointer hover:bg-accent/40")} onClick={() => s.count > 0 && setView({ kind: "type", type: s.type })}>
                        <TableCell className="font-medium">{t(`estimates.types.${s.type}`)}</TableCell>
                        <TableCell className="text-right">{s.count}</TableCell>
                        <TableCell className="text-right">{h0(s.plannedHours)}</TableCell>
                        <TableCell className="text-right">{h0(s.actualHours)}</TableCell>
                        <TableCell className={cn("text-right", tone(s.hoursPct))}>{pct(s.hoursPct)}</TableCell>
                        <TableCell className="text-right">{euros(s.plannedCost)}</TableCell>
                        <TableCell className="text-right">{euros(s.actualValue)}</TableCell>
                        <TableCell className={cn("text-right", tone(s.costPct))}>{pct(s.costPct)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{euros(s.actualCost)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{s.consumedPct == null ? "—" : `${Math.round(s.consumedPct)}%`}</TableCell>
                        <TableCell className={cn("text-right", tone(s.best))}>{pct(s.best)}</TableCell>
                        <TableCell className={cn("text-right", tone(s.median))}>{pct(s.median)}</TableCell>
                        <TableCell className={cn("text-right", tone(s.worst))}>{pct(s.worst)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {s.durationCount ? `${d0(s.plannedDaysAvg)} → ${d0(s.actualDaysAvg)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">{t("estimates.note")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("estimates.sourceCounts", {
                    quote: scoped.filter((r) => r.source === "quote").length,
                    plan: scoped.filter((r) => r.source === "plan").length,
                    baseline: scoped.filter((r) => r.source === "baseline").length,
                  })}
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <Sheet open={view != null} onOpenChange={(o) => !o && setView(null)}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
            <SheetHeader>
              <SheetTitle>
                {view?.kind === "type" ? t(`estimates.types.${view.type}`) : view?.kind === "missing" ? t("estimates.missingTitle") : t("estimates.unmappedTitle")}
              </SheetTitle>
            </SheetHeader>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("estimates.cols.stage")}</TableHead>
                  <TableHead className="text-right">{t("estimates.cols.plannedH")}</TableHead>
                  <TableHead className="text-right">{t("estimates.cols.actualH")}</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">{t("estimates.cols.plannedC")}</TableHead>
                  <TableHead className="text-right">{t("estimates.cols.actualC")}</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">{t("estimates.cols.psaCost")}</TableHead>
                  <TableHead className="text-right">{t("estimates.cols.consumed")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...drill].sort((a, b) => (overrun(b) ?? -Infinity) - (overrun(a) ?? -Infinity)).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to="/projects/$projectId" params={{ projectId: r.projectId }} className="font-medium hover:underline">{r.projectName}</Link>
                      <div className="text-xs text-muted-foreground">
                        {r.label}
                        {r.source && <span className="ml-1 rounded border px-1 text-[10px]">{t(`estimates.sources.${r.source}`)}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{h0(r.plannedHours)}</TableCell>
                    <TableCell className="text-right">{h0(r.actualHours)}</TableCell>
                    <TableCell className={cn("text-right", tone(r.hoursPct))}>{pct(r.hoursPct)}</TableCell>
                    <TableCell className="text-right">{r.plannedCost == null ? "—" : euros(r.plannedCost)}</TableCell>
                    <TableCell className="text-right">{euros(r.actualValue)}</TableCell>
                    <TableCell className={cn("text-right", tone(r.costPct))}>{pct(r.costPct)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{euros(r.actualCost)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.consumedPct == null ? "—" : `${Math.round(r.consumedPct)}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SheetContent>
        </Sheet>
      </div>
    </V2PermissionGate>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
