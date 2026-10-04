import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { euros, workingDays } from "@/lib/projects/gantt-utils";
import { useAllStages, useProjects, useResources } from "@/lib/projects/use-planner";
import { useDefaultResourceRates } from "@/lib/projects/use-default-rates";
import { useResourceSchedules } from "@/lib/projects/use-resource-schedules";
import { addDays, mondayOf, TRACKING_START } from "@/lib/reports/hours-logged";
import {
  bucketKindFor,
  bucketSeries,
  byPerson,
  byProject,
  computeBusinessPerformance,
  makeRateResolver,
  pctChange,
  resourceDailyCapacity,
  studioCapacityHours,
  type BPEntry,
  type BusinessPerformance,
} from "@/lib/reports/business-performance";
import { useBusinessPerformanceData } from "@/lib/reports/use-business-performance";

export const Route = createFileRoute("/_app/reports/business")({
  head: () => ({
    meta: [
      { title: "Business performance — PSA Hub Reports" },
      { name: "description", content: "Revenue from billable hours, cost, profit and utilisation by period, project and person." },
      { property: "og:title", content: "Business performance — PSA Hub Reports" },
      { property: "og:description", content: "Revenue from billable hours, cost, profit and utilisation by period, project and person." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BusinessPage,
});

type Preset = "lastWeek" | "lastMonth" | "last6Months" | "lastYear" | "custom";
const PRESETS: Preset[] = ["lastWeek", "lastMonth", "last6Months", "lastYear", "custom"];
type StatusFilter = "all" | "active" | "paused" | "closing" | "archived";
const STATUSES: StatusFilter[] = ["all", "active", "paused", "closing", "archived"];

function presetRange(p: Preset): { start: string; end: string } {
  const today = new Date();
  const thisMonday = mondayOf(toLocalISODate(today));
  if (p === "lastWeek") return { start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
  const months = p === "lastMonth" ? 1 : p === "last6Months" ? 6 : 12;
  return {
    start: toLocalISODate(new Date(today.getFullYear(), today.getMonth() - months, 1)),
    end: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 0)),
  };
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const fmtH = (n: number) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

function BusinessPage() {
  const { t, i18n } = useTranslation("reports");
  const [preset, setPreset] = useState<Preset>("lastMonth");
  const [custom, setCustom] = useState(presetRange("lastMonth"));
  const [dept, setDept] = useState("all");
  const [team, setTeam] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const yesterday = addDays(toLocalISODate(new Date()), -1);
  const raw = preset === "custom" ? { start: custom.start, end: custom.end > yesterday ? yesterday : custom.end } : presetRange(preset);
  const allBeforeTracking = raw.end < TRACKING_START;
  const startsBeforeTracking = !allBeforeTracking && raw.start < TRACKING_START;
  const start = raw.start < TRACKING_START ? TRACKING_START : raw.start;
  const end = raw.end;
  const len = dayDiff(start, end) + 1;
  const prevEnd = addDays(start, -1);
  const prevStartRaw = addDays(start, -len);
  const prevStart = prevStartRaw < TRACKING_START ? TRACKING_START : prevStartRaw;
  const hasPrev = prevEnd >= TRACKING_START;
  const fetchStart = hasPrev ? prevStart : start;

  const { data, isLoading, error } = useBusinessPerformanceData(allBeforeTracking ? "" : fetchStart, end);
  const { data: stages, isLoading: sLoading } = useAllStages();
  const { data: projects } = useProjects();
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const { data: schedules } = useResourceSchedules();

  const stageById = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s])), [stages]);
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const ratesFor = useMemo(
    () =>
      makeRateResolver({
        taskToStage: data?.taskToStage,
        stageRepResource: (sid) => stageById.get(sid)?.allocations[0]?.resource_id ?? null,
        resources,
        defaultRates,
      }),
    [data, stageById, resources, defaultRates],
  );
  const projectOf = (e: BPEntry) => {
    const sid = e.task_id ? data?.taskToStage.get(e.task_id) : undefined;
    return sid ? stageById.get(sid)?.project_id ?? null : null;
  };

  const roster = data?.roster ?? [];
  const teams = useMemo(() => [...new Set(roster.map((r) => r.team).filter(Boolean) as string[])].sort(), [roster]);
  const people = roster.filter((p) => (dept === "all" || p.department === dept) && (team === "all" || p.team === team));
  const peopleFiltered = dept !== "all" || team !== "all";
  const userSet = new Set(people.map((p) => p.userId));

  const filterEntries = (from: string, to: string) =>
    (data?.entries ?? []).filter((e) => {
      if (e.entry_date < from || e.entry_date > to) return false;
      if (peopleFiltered && !userSet.has(e.user_id)) return false;
      if (status !== "all" && e.entry_type === "project") {
        const pid = projectOf(e);
        if (!pid || projectById.get(pid)?.status !== status) return false;
      }
      return true;
    });

  const capacityFor = (from: string, to: string) => {
    const wd = workingDays(from, to);
    if (!peopleFiltered) return studioCapacityHours(resources ?? [], wd);
    const ids = new Set(people.map((p) => p.resourceId).filter(Boolean));
    return studioCapacityHours((resources ?? []).filter((r) => ids.has(r.id)), wd);
  };

  const cur = filterEntries(start, end);
  const kpi = computeBusinessPerformance({ entries: cur, ratesFor, capacityHours: capacityFor(start, end) });
  const prev = hasPrev
    ? computeBusinessPerformance({ entries: filterEntries(prevStart, prevEnd), ratesFor, capacityHours: capacityFor(prevStart, prevEnd) })
    : null;

  const kind = bucketKindFor(start, end);
  const series = bucketSeries(cur, ratesFor, start, end, kind).map((p) => ({
    ...p,
    label:
      kind === "month"
        ? new Date(p.key + "-01T00:00:00").toLocaleDateString(i18n.language, { month: "short", year: "2-digit" })
        : new Date(p.key + "T00:00:00").toLocaleDateString(i18n.language, { day: "numeric", month: "short" }),
  }));

  const projectRows = byProject(cur, ratesFor, projectOf).map((r) => {
    const p = projectById.get(r.projectId);
    return { ...r, name: p ? `${p.project_number ?? ""} ${p.name}`.trim() : "—" };
  });
  const resById = new Map((resources ?? []).map((r) => [r.id, r]));
  const wd = workingDays(start, end);
  const personRows = byPerson(
    cur,
    people.map((p) => {
      const r = p.resourceId ? resById.get(p.resourceId) : undefined;
      return {
        userId: p.userId,
        capacity: resourceDailyCapacity(r) * wd,
        targetPct: p.resourceId ? schedules?.get(p.resourceId)?.targetChargeabilityPct ?? null : null,
      };
    }),
  ).map((r) => ({ ...r, name: people.find((p) => p.userId === r.userId)?.name ?? "—" }));

  const loading = isLoading || sLoading;

  return (
    <V2PermissionGate permission="reports.view" scope="all">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("business.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("business.subtitle")}</p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="space-y-1">
              <Label>{t("hours.filters.period")}</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => <SelectItem key={p} value={p}>{t(`business.presets.${p}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {preset === "custom" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="bp-from">{t("hours.filters.from")}</Label>
                  <Input id="bp-from" type="date" min={TRACKING_START} value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bp-to">{t("hours.filters.to")}</Label>
                  <Input id="bp-to" type="date" min={TRACKING_START} max={yesterday} value={end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value > yesterday ? yesterday : e.target.value }))} />
                </div>
              </>
            )}
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
              <Label>{t("business.filters.projectStatus")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`business.status.${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-right text-xs text-muted-foreground">
              <p>{t("hours.rangeLabel", { start, end })}</p>
              {startsBeforeTracking && <p className="mt-0.5">{t("hours.trackingNote")}</p>}
            </div>
          </CardContent>
        </Card>

        {allBeforeTracking ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t("hours.beforeTracking")}</CardContent></Card>
        ) : error ? (
          <Card><CardContent className="py-8 text-center text-sm text-destructive">{t("hours.error")}</CardContent></Card>
        ) : loading ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
            <Skeleton className="h-80" />
          </div>
        ) : (
          <>
            <Tiles kpi={kpi} prev={prev} />

            <div className="grid gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t(kind === "week" ? "business.chart.moneyWeek" : "business.chart.moneyMonth")}</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={60} />
                      <Tooltip formatter={(v: number) => euros(v)} />
                      <Legend />
                      <Bar dataKey="revenue" name={t("business.tiles.revenueShort")} fill="var(--primary)" />
                      <Bar dataKey="cost" name={t("business.tiles.cost")} fill="var(--muted-foreground)" fillOpacity={0.5} />
                      <Bar dataKey="profit" name={t("business.tiles.profit")} fill="var(--accent-foreground)" fillOpacity={0.7} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t(kind === "week" ? "business.chart.utilWeek" : "business.chart.utilMonth")}</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" width={44} />
                      <Tooltip formatter={(v: number) => `${Math.round(v)}%`} />
                      <Line type="monotone" dataKey="utilizationPct" name={t("business.tiles.utilization")} stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("business.byProject.title")}</CardTitle></CardHeader>
              <SortTable
                empty={t("business.byProject.empty")}
                rows={projectRows}
                rowKey={(r) => r.projectId}
                initial={{ key: "revenue", dir: "desc" }}
                cols={[
                  { key: "name", label: t("business.byProject.project"), get: (r) => r.name, render: (r) => r.name, left: true },
                  { key: "hours", label: t("business.byProject.hours"), get: (r) => r.hours, render: (r) => fmtH(r.hours) },
                  { key: "revenue", label: t("business.tiles.revenueShort"), get: (r) => r.revenue, render: (r) => euros(r.revenue) },
                  { key: "cost", label: t("business.tiles.cost"), get: (r) => r.cost, render: (r) => euros(r.cost) },
                  { key: "profit", label: t("business.tiles.profit"), get: (r) => r.profit, render: (r) => <span className={cn(r.profit < 0 && "text-destructive")}>{euros(r.profit)}</span> },
                  { key: "margin", label: t("business.byProject.margin"), get: (r) => r.marginPct ?? -Infinity, render: (r) => (r.marginPct == null ? "—" : `${Math.round(r.marginPct)}%`) },
                ]}
              />
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("business.byPerson.title")}</CardTitle></CardHeader>
              <SortTable
                empty={t("hours.empty")}
                rows={personRows}
                rowKey={(r) => r.userId}
                initial={{ key: "logged", dir: "desc" }}
                cols={[
                  { key: "name", label: t("hours.cols.person"), get: (r) => r.name, render: (r) => r.name, left: true },
                  { key: "capacity", label: t("business.byPerson.capacity"), get: (r) => r.capacity, render: (r) => `${fmtH(r.capacity)} h` },
                  { key: "logged", label: t("hours.cols.logged"), get: (r) => r.logged, render: (r) => `${fmtH(r.logged)} h` },
                  { key: "billable", label: t("business.byPerson.billablePct"), get: (r) => r.billablePct ?? -1, render: (r) => (r.billablePct == null ? "—" : `${Math.round(r.billablePct)}%`) },
                  {
                    key: "internal",
                    label: t("business.byPerson.internalPct"),
                    get: (r) => r.internalPct ?? -1,
                    render: (r) =>
                      r.internalPct == null ? "—" : (
                        <span className={cn(r.overInternal && "font-medium text-destructive")}>
                          {Math.round(r.internalPct)}%
                          {r.targetPct != null && r.targetPct > 0 && (
                            <span className="ml-1 text-[11px] text-muted-foreground">{t("business.byPerson.target", { pct: Math.round(100 - r.targetPct) })}</span>
                          )}
                        </span>
                      ),
                  },
                ]}
              />
            </Card>
          </>
        )}
      </div>
    </V2PermissionGate>
  );
}

function Tiles({ kpi, prev }: { kpi: BusinessPerformance; prev: BusinessPerformance | null }) {
  const { t } = useTranslation("reports");
  const capPct = kpi.capacityAvailableHours > 0 ? (kpi.capacityUsedHours / kpi.capacityAvailableHours) * 100 : 0;
  const delta = (c: number, p: number | undefined) => {
    const v = prev && p !== undefined ? pctChange(c, p) : null;
    return v == null ? t("business.noPrev") : t("business.vsPrev", { pct: `${v >= 0 ? "+" : ""}${Math.round(v)}` });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <Tile label={t("business.tiles.revenue")} value={euros(kpi.revenue)} sub={delta(kpi.revenue, prev?.revenue)} />
      <Tile label={t("business.tiles.cost")} value={euros(kpi.cost)} sub={delta(kpi.cost, prev?.cost)} />
      <Tile
        label={t("business.tiles.profit")}
        value={<>{euros(kpi.profit)} <span className="text-sm font-medium text-muted-foreground">({Math.round(kpi.marginPct)}%)</span></>}
        sub={delta(kpi.profit, prev?.profit)}
      />
      <Tile label={t("business.tiles.utilization")} value={`${Math.round(kpi.utilizationPct)}%`} sub={delta(kpi.utilizationPct, prev?.utilizationPct)} />
      <Tile
        label={t("business.tiles.capacity")}
        value={<>{Math.round(kpi.capacityUsedHours)}<span className="text-muted-foreground"> / {Math.round(kpi.capacityAvailableHours)} h</span></>}
        sub={`${Math.round(capPct)}% · ${delta(kpi.capacityUsedHours, prev?.capacityUsedHours)}`}
      />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

type Col<R> = { key: string; label: string; get: (r: R) => number | string; render: (r: R) => React.ReactNode; left?: boolean };

function SortTable<R>({ rows, cols, rowKey, initial, empty }: { rows: R[]; cols: Col<R>[]; rowKey: (r: R) => string; initial: { key: string; dir: "asc" | "desc" }; empty: string }) {
  const [sort, setSort] = useState(initial);
  const col = cols.find((c) => c.key === sort.key) ?? cols[0];
  const sorted = [...rows].sort((a, b) => {
    const x = col.get(a);
    const y = col.get(b);
    const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
    return sort.dir === "asc" ? c : -c;
  });
  if (rows.length === 0) return <CardContent className="py-8 text-center text-sm text-muted-foreground">{empty}</CardContent>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {cols.map((c) => {
            const Icon = sort.key === c.key ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
            return (
              <TableHead key={c.key} className={cn(!c.left && "text-right")} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                >
                  {c.label}
                  <Icon className="h-3 w-3" aria-hidden="true" />
                </button>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((r) => (
          <TableRow key={rowKey(r)}>
            {cols.map((c) => (
              <TableCell key={c.key} className={cn(!c.left ? "text-right tabular-nums" : "font-medium")}>{c.render(r)}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
