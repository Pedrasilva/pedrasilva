import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { allocationHours, euros } from "@/lib/projects/gantt-utils";
import { useAllStages, useProjects, useResources } from "@/lib/projects/use-planner";
import { effectiveCostRate, effectiveSaleRate, useDefaultResourceRates } from "@/lib/projects/use-default-rates";
import { pursuitByProject, usePursuitTotals } from "@/lib/projects/use-pursuit";
import {
  consumptionBand,
  consumptionTotals,
  projectActualsFromStages,
  scheduleElapsedPct,
  stageActuals,
  type ConsumptionBand,
  type StageLite,
} from "@/lib/reports/budget-consumption";
import { useBudgetConsumptionData } from "@/lib/reports/use-budget-consumption";

export const Route = createFileRoute("/_app/reports/budget")({
  head: () => ({
    meta: [
      { title: "Budget vs consumption — PSA Hub Reports" },
      { name: "description", content: "How much of each project's budget has been used, compared with time elapsed." },
      { property: "og:title", content: "Budget vs consumption — PSA Hub Reports" },
      { property: "og:description", content: "How much of each project's budget has been used, compared with time elapsed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BudgetPage,
});

type StatusFilter = "active" | "paused" | "closing" | "all";
const STATUSES: StatusFilter[] = ["active", "paused", "closing", "all"];

const BAND_FILL: Record<ConsumptionBand, string> = {
  ok: "bg-emerald-500",
  near: "bg-amber-500",
  over: "bg-destructive",
};
const BAND_BADGE: Record<ConsumptionBand, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  near: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400",
  over: "bg-destructive/15 text-destructive border-destructive/30",
};
const pct0 = (n: number | null) => (n == null ? "—" : `${Math.round(n)}%`);
const h0 = (n: number) => `${Math.round(n)} h`;

interface Row {
  id: string;
  name: string;
  budget: number;
  labor: number;
  pursuit: number;
  other: number;
  cost: number;
  pct: number | null;
  band: ConsumptionBand;
  logged: number;
  planned: number;
  elapsed: number | null;
  stages: { id: string; name: string; budget: number; cost: number; pct: number | null; logged: number; planned: number }[];
}

function BudgetPage() {
  const { t } = useTranslation("reports");
  const today = toLocalISODate(new Date());
  const [upTo, setUpTo] = useState(today);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [dept, setDept] = useState("all");
  const [team, setTeam] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const asOf = upTo && upTo <= today ? upTo : today;
  const { data, isLoading, error } = useBudgetConsumptionData(asOf);
  const { data: projects, isLoading: pLoading } = useProjects();
  const { data: stages, isLoading: sLoading } = useAllStages();
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const { data: pursuitRows } = usePursuitTotals(null, true);

  const resById = useMemo(() => new Map((resources ?? []).map((r) => [r.id, r])), [resources]);
  const stageById = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s as unknown as StageLite])), [stages]);
  const pursuit = useMemo(
    () =>
      pursuitByProject(
        pursuitRows ?? [],
        (rid) => {
          const r = resById.get(rid);
          return r ? { cost_rate: r.cost_rate, isOverride: !!r.hourly_rate_is_override } : undefined;
        },
        defaultRates,
      ),
    [pursuitRows, resById, defaultRates],
  );

  const roster = data?.roster ?? [];
  const teams = useMemo(() => [...new Set(roster.map((r) => r.team).filter(Boolean) as string[])].sort(), [roster]);

  const allRows: Row[] = useMemo(() => {
    if (!data || !projects || !stages) return [];
    const byStage = stageActuals({
      entries: data.entries,
      taskToStage: data.taskToStage,
      stageById,
      costRateFor: (rid) => {
        const r = resById.get(rid);
        return effectiveCostRate(r?.cost_rate, rid, defaultRates, !!r?.hourly_rate_is_override);
      },
      saleRateFor: (rid) => {
        const r = resById.get(rid);
        return effectiveSaleRate(r?.hourly_rate, rid, defaultRates, !!r?.hourly_rate_is_override);
      },
    });
    const byProject = projectActualsFromStages(byStage, stageById);
    const stagesByProject = new Map<string, typeof stages>();
    for (const s of stages) stagesByProject.set(s.project_id, [...(stagesByProject.get(s.project_id) ?? []), s]);
    return projects.map((p) => {
      const ps = stagesByProject.get(p.id) ?? [];
      const budget = ps.reduce((a, s) => a + Number(s.budget), 0);
      const labor = byProject.get(p.id)?.laborCost ?? 0;
      const pur = pursuit.get(p.id)?.cost ?? 0;
      const other = data.otherCost.get(p.id) ?? 0;
      const cost = labor + pur + other;
      const pct = budget > 0 ? (cost / budget) * 100 : null;
      const starts = ps.map((s) => s.start_date).filter(Boolean).sort();
      const ends = ps.map((s) => s.end_date).filter(Boolean).sort();
      const start = p.start_date ?? starts[0] ?? null;
      const end = ends[ends.length - 1] ?? null;
      const stageRows = ps.map((s) => {
        const a = byStage.get(s.id);
        const sb = Number(s.budget) || 0;
        const sc = a?.laborCost ?? 0;
        const gantt = (s as { gantt_number?: string | null }).gantt_number;
        return {
          id: s.id,
          name: gantt ? `${gantt} ${s.name}` : s.name,
          budget: sb,
          cost: sc,
          pct: sb > 0 ? (sc / sb) * 100 : null,
          logged: a?.loggedHours ?? 0,
          planned: s.allocations.reduce((x, al) => x + allocationHours(al), 0),
        };
      });
      return {
        id: p.id,
        name: p.name,
        budget,
        labor,
        pursuit: pur,
        other,
        cost,
        pct,
        band: consumptionBand(pct ?? 0),
        logged: byProject.get(p.id)?.loggedHours ?? 0,
        planned: stageRows.reduce((x, s) => x + s.planned, 0),
        elapsed: scheduleElapsedPct(start, end, asOf),
        stages: stageRows,
        _status: p.status ?? "active",
        _client: p.client ?? "",
      } as Row & { _status: string; _client: string };
    });
  }, [data, projects, stages, stageById, resById, defaultRates, pursuit, asOf]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const peopleRes = new Set(
      roster.filter((p) => (dept === "all" || p.department === dept) && (team === "all" || p.team === team)).map((p) => p.resourceId),
    );
    const peopleFiltered = dept !== "all" || team !== "all";
    return (allRows as (Row & { _status: string; _client: string })[]).filter((r) => {
      if (status !== "all" && r._status !== status) return false;
      if (needle && !r.name.toLowerCase().includes(needle) && !r._client.toLowerCase().includes(needle)) return false;
      if (peopleFiltered && !(data?.teamByProject.get(r.id) ?? []).some((rid) => peopleRes.has(rid))) return false;
      return true;
    });
  }, [allRows, status, q, dept, team, roster, data]);

  const budgeted = rows.filter((r) => r.budget > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const noBudget = rows.filter((r) => r.budget <= 0 && r.cost > 0).sort((a, b) => b.cost - a.cost);
  const totals = consumptionTotals(budgeted.map((r) => ({ projectId: r.id, budget: r.budget, laborCost: r.labor, pursuitCost: r.pursuit, otherCost: r.other, cost: r.cost, pct: r.pct })));
  const scatter = budgeted.filter((r) => r.elapsed != null).map((r) => ({ x: r.elapsed!, y: Math.min(r.pct ?? 0, 200), name: r.name, above: (r.pct ?? 0) > r.elapsed! }));
  const noDates = budgeted.length - scatter.length;
  const maxPct = Math.max(100, ...budgeted.map((r) => r.pct ?? 0));
  const loading = isLoading || pLoading || sLoading;

  return (
    <V2PermissionGate permission="reports.view" scope="all">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("budget.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("budget.subtitle")}</p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="space-y-1">
              <Label>{t("business.filters.projectStatus")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`business.status.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("hours.filters.department")}</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("hours.filters.all")}</SelectItem>
                  <SelectItem value="Projecto">{t("hours.departments.Projecto")}</SelectItem>
                  <SelectItem value="Backoffice">{t("hours.departments.Backoffice")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("hours.filters.team")}</Label>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("hours.filters.all")}</SelectItem>
                  {teams.map((tm) => <SelectItem key={tm} value={tm}>{tm}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bc-upto">{t("budget.upTo")}</Label>
              <Input id="bc-upto" type="date" max={today} value={upTo} onChange={(e) => setUpTo(e.target.value || today)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bc-q">{t("budget.search")}</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="bc-q" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 pl-8" placeholder={t("budget.searchPlaceholder")} />
              </div>
            </div>
            <p className="ml-auto text-xs text-muted-foreground">{asOf === today ? t("budget.toDate") : t("budget.upToLabel", { date: asOf })}</p>
          </CardContent>
        </Card>

        {error ? (
          <Card><CardContent className="py-8 text-center text-sm text-destructive">{t("hours.error")}</CardContent></Card>
        ) : loading ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            <Skeleton className="h-80" />
            <Skeleton className="h-72" />
            <Skeleton className="h-80" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <Tile label={t("budget.tiles.budget")} value={euros(totals.budget)} />
              <Tile label={t("budget.tiles.cost")} value={euros(totals.cost)} />
              <Tile label={t("budget.tiles.used")} value={pct0(totals.pct)} />
              <Tile label={t("budget.tiles.over")} value={String(totals.overCount)} sub={t("budget.tiles.overSub", { amount: euros(totals.overAmount) })} />
              <Tile label={t("budget.tiles.near")} value={String(totals.nearCount)} />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("budget.chart.title")}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {budgeted.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("budget.empty")}</p>}
                {budgeted.map((r) => {
                  const scale = 100 / maxPct;
                  const p = r.pct ?? 0;
                  return (
                    <UiTooltip key={r.id}>
                      <TooltipTrigger asChild>
                        <div className="cursor-default" tabIndex={0}>
                          <p className="mb-0.5 truncate text-xs">
                            {t("budget.chart.label", { name: r.name, cost: euros(r.cost), budget: euros(r.budget), pct: Math.round(p) })}
                          </p>
                          <div className="relative h-3 w-full">
                            <div className="absolute inset-y-0 left-0 rounded-sm bg-muted" style={{ width: `${100 * scale}%` }} />
                            <div className={cn("absolute inset-y-0 left-0 rounded-sm", BAND_FILL[r.band])} style={{ width: `${Math.min(p, 100) * scale}%` }} />
                            {p > 100 && (
                              <div className="absolute inset-y-0 rounded-r-sm bg-destructive/60" style={{ left: `${100 * scale}%`, width: `${(p - 100) * scale}%` }} />
                            )}
                            <div className="absolute inset-y-[-2px] w-px bg-foreground/40" style={{ left: `${100 * scale}%` }} />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        <p className="font-medium">{r.name}</p>
                        <p>{t("budget.cols.budget")}: {euros(r.budget)}</p>
                        <p>{t("budget.cols.cost")}: {euros(r.cost)}{r.pursuit > 0 && ` (${t("budget.pursuit")}: ${euros(r.pursuit)})`}</p>
                        <p>{t("budget.cols.remaining")}: {euros(r.budget - r.cost)}</p>
                        <p>{t("budget.cols.hours")}: {h0(r.logged)} / {h0(r.planned)}</p>
                      </TooltipContent>
                    </UiTooltip>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("budget.pace.title")}</CardTitle>
                {noDates > 0 && <p className="text-xs text-muted-foreground">{t("budget.pace.noDates", { count: noDates })}</p>}
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} name={t("budget.pace.x")} label={{ value: t("budget.pace.x"), position: "insideBottom", offset: -8, fontSize: 11 }} />
                    <YAxis type="number" dataKey="y" domain={[0, (dmax: number) => Math.max(100, Math.ceil(dmax / 10) * 10)]} unit="%" tick={{ fontSize: 11 }} name={t("budget.pace.y")} width={50} />
                    <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="var(--muted-foreground)" strokeDasharray="4 4" ifOverflow="extendDomain" />
                    <Tooltip
                      cursor={false}
                      content={({ payload }) => {
                        const d = payload?.[0]?.payload as (typeof scatter)[number] | undefined;
                        if (!d) return null;
                        return (
                          <div className="rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground">
                            <p className="font-medium">{d.name}</p>
                            <p>{t("budget.pace.x")}: {Math.round(d.x)}%</p>
                            <p>{t("budget.pace.y")}: {Math.round(d.y)}%</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={scatter.filter((s) => !s.above)} fill="var(--muted-foreground)" />
                    <Scatter data={scatter.filter((s) => s.above)} fill="var(--destructive)">
                      <LabelList dataKey="name" position="top" style={{ fontSize: 10, fill: "var(--foreground)" }} />
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{t("business.byProject.project")}</TableHead>
                    <TableHead className="text-right">{t("budget.cols.budget")}</TableHead>
                    <TableHead className="text-right">{t("budget.cols.cost")}</TableHead>
                    <TableHead className="text-right">{t("budget.cols.remaining")}</TableHead>
                    <TableHead className="text-right">{t("budget.cols.used")}</TableHead>
                    <TableHead>{t("hours.cols.status")}</TableHead>
                    <TableHead className="text-right">{t("budget.cols.hours")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgeted.map((r) => {
                    const isOpen = open.has(r.id);
                    const Icon = isOpen ? ChevronDown : ChevronRight;
                    const toggle = () => setOpen((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
                    return (
                      <Fragment key={r.id}>
                        <TableRow className="cursor-pointer" onClick={toggle}>
                          <TableCell>
                            <button type="button" aria-expanded={isOpen} aria-label={t(isOpen ? "budget.collapse" : "budget.expand", { name: r.name })} onClick={(e) => { e.stopPropagation(); toggle(); }} className="rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <Icon className="h-4 w-4" />
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{euros(r.budget)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {euros(r.cost)}
                            {r.pursuit > 0 && <div className="text-[11px] text-muted-foreground">{t("budget.pursuit")}: {euros(r.pursuit)}</div>}
                          </TableCell>
                          <TableCell className={cn("text-right tabular-nums", r.budget - r.cost < 0 && "text-destructive")}>{euros(r.budget - r.cost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct0(r.pct)}</TableCell>
                          <TableCell><Badge variant="outline" className={BAND_BADGE[r.band]}>{t(`budget.band.${r.band}`)}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{h0(r.logged)} / {h0(r.planned)}</TableCell>
                        </TableRow>
                        {isOpen && r.stages.map((s) => (
                          <TableRow key={s.id} className="bg-muted/30 text-xs hover:bg-muted/30">
                            <TableCell />
                            <TableCell className="pl-6">{s.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(s.budget)}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(s.cost)}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(s.budget - s.cost)}</TableCell>
                            <TableCell className="text-right tabular-nums">{pct0(s.pct)}</TableCell>
                            <TableCell>{s.pct != null && <Badge variant="outline" className={BAND_BADGE[consumptionBand(s.pct)]}>{t(`budget.band.${consumptionBand(s.pct)}`)}</Badge>}</TableCell>
                            <TableCell className="text-right tabular-nums">{h0(s.logged)} / {h0(s.planned)}</TableCell>
                          </TableRow>
                        ))}
                        {isOpen && (r.pursuit > 0 || r.other > 0) && (
                          <TableRow className="bg-muted/30 text-[11px] text-muted-foreground hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={7} className="pl-6">{t("budget.projectLevel", { pursuit: euros(r.pursuit), other: euros(r.other) })}</TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {noBudget.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("budget.noBudget.title")}</CardTitle>
                  <p className="text-xs text-muted-foreground">{t("budget.noBudget.hint")}</p>
                </CardHeader>
                <Table>
                  <TableBody>
                    {noBudget.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{euros(r.cost)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h0(r.logged)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </>
        )}
      </div>
    </V2PermissionGate>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
        {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
