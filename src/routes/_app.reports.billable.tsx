import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAllStages, useProjects } from "@/lib/projects/use-planner";
import { useResourceSchedules } from "@/lib/projects/use-resource-schedules";
import { buildStageNumberMap, formatStageLabel } from "@/lib/quotes/stage-numbering";
import { addDays, mondayOf, TRACKING_START, type RosterPerson } from "@/lib/reports/hours-logged";
import { bucketKindFor } from "@/lib/reports/business-performance";
import {
  byProjectStage,
  internalByCategory,
  pctOf,
  splitOf,
  splitSeries,
  weightedTarget,
  type Split,
  type SplitEntry,
} from "@/lib/reports/billable-split";
import { useBillableSplitData } from "@/lib/reports/use-billable-split";

export const Route = createFileRoute("/_app/reports/billable")({
  head: () => ({
    meta: [
      { title: "Billable vs non-billable — PSA Hub Reports" },
      { name: "description", content: "Billable project, non-billable project and internal hours by period and person, against chargeability targets." },
      { property: "og:title", content: "Billable vs non-billable — PSA Hub Reports" },
      { property: "og:description", content: "Billable project, non-billable project and internal hours by period and person, against chargeability targets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillablePage,
});

type Preset = "lastWeek" | "lastMonth" | "last6Months" | "lastYear" | "custom";
const PRESETS: Preset[] = ["lastWeek", "lastMonth", "last6Months", "lastYear", "custom"];
const C = { billable: "var(--chart-2)", nonBillable: "var(--chart-4)", internal: "var(--muted-foreground)" };

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

const fmtH = (n: number) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
const fmtP = (n: number | null) => (n == null ? "—" : `${Math.round(n)}%`);

type PersonRow = { person: RosterPerson; split: Split; billPct: number | null; targetPct: number | null; backOffice: boolean; diff: number | null };

function BillablePage() {
  const { t, i18n } = useTranslation("reports");
  const [preset, setPreset] = useState<Preset>("lastMonth");
  const [custom, setCustom] = useState(presetRange("lastMonth"));
  const [dept, setDept] = useState("all");
  const [team, setTeam] = useState("all");
  const [openUser, setOpenUser] = useState<string | null>(null);

  const yesterday = addDays(toLocalISODate(new Date()), -1);
  const raw = preset === "custom" ? { start: custom.start, end: custom.end > yesterday ? yesterday : custom.end } : presetRange(preset);
  const allBeforeTracking = raw.end < TRACKING_START;
  const startsBeforeTracking = !allBeforeTracking && raw.start < TRACKING_START;
  const start = raw.start < TRACKING_START ? TRACKING_START : raw.start;
  const end = raw.end;

  const { data, isLoading, error } = useBillableSplitData(allBeforeTracking ? "" : start, end);
  const { data: schedules } = useResourceSchedules();

  const roster = data?.roster ?? [];
  const teams = useMemo(() => [...new Set(roster.map((r) => r.team).filter(Boolean) as string[])].sort(), [roster]);
  const people = roster.filter((p) => (dept === "all" || p.department === dept) && (team === "all" || p.team === team));
  const filtered = dept !== "all" || team !== "all";
  const userSet = new Set(people.map((p) => p.userId));
  const entries = (data?.entries ?? []).filter((e) => !filtered || userSet.has(e.user_id));

  const total = splitOf(entries);
  const kind = bucketKindFor(start, end);
  const label = (key: string) =>
    kind === "month"
      ? new Date(key + "-01T00:00:00").toLocaleDateString(i18n.language, { month: "short", year: "2-digit" })
      : new Date(key + "T00:00:00").toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
  const series = splitSeries(entries, start, end, kind).points.map((p) => ({ ...p, label: label(p.key) }));

  const byUser = new Map<string, SplitEntry[]>();
  for (const e of entries) byUser.set(e.user_id, [...(byUser.get(e.user_id) ?? []), e]);
  const personRows: PersonRow[] = people
    .map((person) => {
      const split = splitOf(byUser.get(person.userId) ?? []);
      const billPct = pctOf(split.billable, split);
      const tp = person.resourceId ? schedules?.get(person.resourceId)?.targetChargeabilityPct ?? null : null;
      const targetPct = tp != null && tp > 0 ? tp : null;
      return { person, split, billPct, targetPct, backOffice: tp != null && tp <= 0, diff: billPct != null && targetPct != null ? billPct - targetPct : null };
    })
    .filter((r) => r.split.logged > 0 || r.split.leave > 0)
    .sort((a, b) => (b.billPct ?? -1) - (a.billPct ?? -1));
  const teamTarget = weightedTarget(personRows.map((r) => ({ logged: r.split.logged, targetPct: r.targetPct })));
  // Like with like: the project team = people with a target above 0% (back office excluded from both sides).
  const projTeam = personRows.filter((r) => r.targetPct != null);
  const projTotal = projTeam.reduce((a, r) => ({ ...a, logged: a.logged + r.split.logged, billable: a.billable + r.split.billable }), { ...total, logged: 0, billable: 0 });
  const openRow = personRows.find((r) => r.person.userId === openUser) ?? null;

  return (
    <V2PermissionGate permission="reports.view" scope="all">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("billable.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("billable.subtitle")}</p>
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
                  <Label htmlFor="bs-from">{t("hours.filters.from")}</Label>
                  <Input id="bs-from" type="date" min={TRACKING_START} value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bs-to">{t("hours.filters.to")}</Label>
                  <Input id="bs-to" type="date" min={TRACKING_START} max={yesterday} value={end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value > yesterday ? yesterday : e.target.value }))} />
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
        ) : isLoading ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            <Skeleton className="h-16" />
            <Skeleton className="h-64" />
            <Skeleton className="h-80" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <Tile label={t("billable.tiles.logged")} value={`${fmtH(total.logged)} h`} sub={t("billable.leaveContext", { h: fmtH(total.leave) })} />
              <Tile label={t("billable.kinds.billable")} value={fmtP(pctOf(total.billable, total))} sub={`${fmtH(total.billable)} h`} />
              <Tile label={t("billable.kinds.nonBillable")} value={fmtP(pctOf(total.nonBillable, total))} sub={`${fmtH(total.nonBillable)} h`} />
              <Tile label={t("billable.kinds.internal")} value={fmtP(pctOf(total.internal, total))} sub={`${fmtH(total.internal)} h`} />
              <Tile
                label={t("billable.tiles.target")}
                value={<>{fmtP(pctOf(projTotal.billable, projTotal))}<span className="text-muted-foreground"> / {fmtP(teamTarget)}</span></>}
                sub={<>
                  <span className="block">{t("billable.tiles.projectTeam", { actual: fmtP(pctOf(projTotal.billable, projTotal)), target: fmtP(teamTarget) })}</span>
                  <span className="block">{t("billable.tiles.wholeStudio", { pct: fmtP(pctOf(total.billable, total)) })}</span>
                </>}
              />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("billable.chart.period")}</CardTitle></CardHeader>
              <CardContent>
                <StackBar split={total} height="h-6" />
                <Legend3 />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t(kind === "week" ? "billable.chart.week" : "billable.chart.month")}</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} unit=" h" />
                    <Tooltip formatter={(v: number) => `${fmtH(v)} h`} />
                    <Legend />
                    <Bar dataKey="billable" stackId="a" name={t("billable.kinds.billable")} fill={C.billable} />
                    <Bar dataKey="nonBillable" stackId="a" name={t("billable.kinds.nonBillable")} fill={C.nonBillable} />
                    <Bar dataKey="internal" stackId="a" name={t("billable.kinds.internal")} fill={C.internal} fillOpacity={0.5} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("billable.byPerson.title")}</CardTitle>
                <p className="text-xs text-muted-foreground">{t("billable.byPerson.hint")}</p>
              </CardHeader>
              {personRows.length === 0 ? (
                <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("hours.empty")}</CardContent>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hours.cols.person")}</TableHead>
                      <TableHead className="w-[28%]">{t("billable.byPerson.split")}</TableHead>
                      <TableHead className="text-right">{t("hours.cols.logged")}</TableHead>
                      <TableHead className="text-right">{t("billable.kinds.billable")}</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">{t("billable.kinds.nonBillable")}</TableHead>
                      <TableHead className="text-right">{t("billable.kinds.internal")}</TableHead>
                      <TableHead className="text-right">{t("billable.byPerson.target")}</TableHead>
                      <TableHead className="text-right">{t("billable.byPerson.diff")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {personRows.map((r) => (
                      <TableRow key={r.person.userId} className="cursor-pointer" onClick={() => setOpenUser(r.person.userId)}>
                        <TableCell className="font-medium">
                          <button type="button" className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{r.person.name}</button>
                        </TableCell>
                        <TableCell><StackBar split={r.split} target={r.targetPct} /></TableCell>
                        <TableCell className="text-right tabular-nums">{fmtH(r.split.logged)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtH(r.split.billable)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtP(r.billPct)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtH(r.split.nonBillable)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtH(r.split.internal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.backOffice ? t("billable.byPerson.backOffice") : fmtP(r.targetPct)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", r.diff != null && r.diff < 0 && "font-medium text-destructive")}>
                          {r.diff == null ? "—" : `${r.diff >= 0 ? "+" : ""}${Math.round(r.diff)} p.p.`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </>
        )}
      </div>

      <Sheet open={!!openRow} onOpenChange={(o) => !o && setOpenUser(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {openRow && (
            <PersonDetail
              row={openRow}
              entries={byUser.get(openRow.person.userId) ?? []}
              taskToStage={data?.taskToStage}
              start={start}
              end={end}
              label={label}
            />
          )}
        </SheetContent>
      </Sheet>
    </V2PermissionGate>
  );
}

function PersonDetail({ row, entries, taskToStage, start, end, label }: { row: PersonRow; entries: SplitEntry[]; taskToStage?: Map<string, string>; start: string; end: string; label: (k: string) => string }) {
  const { t } = useTranslation("reports");
  const { data: stages } = useAllStages();
  const { data: projects } = useProjects();
  const stageById = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s])), [stages]);
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const numbers = useMemo(() => {
    const byProj = new Map<string, NonNullable<typeof stages>>();
    for (const s of stages ?? []) byProj.set(s.project_id, [...(byProj.get(s.project_id) ?? []), s]);
    const m = new Map<string, string>();
    for (const list of byProj.values()) for (const [k, v] of buildStageNumberMap(list)) m.set(k, v);
    return m;
  }, [stages]);

  const projRows = byProjectStage(entries, (e) => (e.task_id ? taskToStage?.get(e.task_id) ?? null : null), (sid) => stageById.get(sid)?.project_id ?? null);
  const cats = internalByCategory(entries);
  const weekly = splitSeries(entries, start, end, "week").points;
  const trend = weekly.map((w) => ({ key: w.key, label: label(w.key), pct: w.logged > 0 ? Math.round((w.billable / w.logged) * 100) : null }));
  const projName = (pid: string | null) => (pid ? projectById.get(pid)?.name ?? "—" : t("billable.detail.noProject"));
  const stageName = (sid: string | null) => {
    const s = sid ? stageById.get(sid) : undefined;
    return s ? formatStageLabel(s, numbers.get(s.id)) : "—";
  };
  const maxProj = Math.max(1, ...projRows.map((r) => r.billable + r.nonBillable));

  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle>{row.person.name}</SheetTitle>
        <p className="text-xs text-muted-foreground">
          {t("hours.rangeLabel", { start, end })} · {fmtP(row.billPct)} {t("billable.kinds.billable").toLowerCase()} · {t("billable.byPerson.target")} {fmtP(row.targetPct)}
        </p>
      </SheetHeader>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("billable.detail.byProject")}</h3>
        {projRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("billable.detail.none")}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {projRows.map((r) => (
                <div key={`${r.projectId}|${r.stageId}`} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate" title={projName(r.projectId)}>{projName(r.projectId)}</span>
                  <div className="flex h-3 flex-1 overflow-hidden rounded bg-muted">
                    <div style={{ width: `${(r.billable / maxProj) * 100}%`, background: C.billable }} />
                    <div style={{ width: `${(r.nonBillable / maxProj) * 100}%`, background: C.nonBillable }} />
                  </div>
                </div>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("business.byProject.project")}</TableHead>
                  <TableHead>{t("billable.detail.stage")}</TableHead>
                  <TableHead className="text-right">{t("billable.detail.hBillable")}</TableHead>
                  <TableHead className="text-right">{t("billable.detail.hNonBillable")}</TableHead>
                  <TableHead className="text-right">{t("billable.detail.share")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projRows.map((r) => (
                  <TableRow key={`${r.projectId}|${r.stageId}`}>
                    <TableCell className="font-medium">{projName(r.projectId)}</TableCell>
                    <TableCell className="text-xs">{stageName(r.stageId)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.billable ? fmtH(r.billable) : "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.nonBillable ? fmtH(r.nonBillable) : "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtP(pctOf(r.billable + r.nonBillable, row.split))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("billable.detail.internal")}</h3>
        {cats.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("billable.detail.none")}</p>
        ) : (
          <Table>
            <TableBody>
              {cats.map((c) => (
                <TableRow key={c.category}>
                  <TableCell>{c.category}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtH(c.hours)} h</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtP(pctOf(c.hours, row.split))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("billable.detail.trend")}</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} width={40} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              {row.targetPct != null && <ReferenceLine y={row.targetPct} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: t("billable.byPerson.target"), fontSize: 10, position: "insideTopRight" }} />}
              <Line type="monotone" dataKey="pct" name={t("billable.kinds.billable")} stroke={C.billable} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {weekly.map((w) => (
            <Link
              key={w.key}
              to="/projects/weekly-approval"
              search={{ week: w.key, user: row.person.userId }}
              className="rounded border px-2 py-0.5 text-[11px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={t("billable.detail.viewTimesheet")}
            >
              {t("billable.detail.viewTimesheet")} · {label(w.key)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StackBar({ split, target, height = "h-3" }: { split: Split; target?: number | null; height?: string }) {
  const { t } = useTranslation("reports");
  const tot = split.logged || 1;
  const seg = (v: number, color: string, name: string, op = 1) =>
    v > 0 ? <div style={{ width: `${(v / tot) * 100}%`, background: color, opacity: op }} title={`${name}: ${fmtH(v)} h (${Math.round((v / tot) * 100)}%)`} /> : null;
  return (
    <div className={cn("relative flex w-full overflow-visible rounded bg-muted", height)}>
      <div className="flex w-full overflow-hidden rounded">
        {seg(split.billable, C.billable, t("billable.kinds.billable"))}
        {seg(split.nonBillable, C.nonBillable, t("billable.kinds.nonBillable"))}
        {seg(split.internal, C.internal, t("billable.kinds.internal"), 0.5)}
      </div>
      {target != null && (
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-foreground" style={{ left: `${Math.min(100, target)}%` }} title={`${t("billable.byPerson.target")}: ${Math.round(target)}%`} />
      )}
    </div>
  );
}

function Legend3() {
  const { t } = useTranslation("reports");
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
      {(["billable", "nonBillable", "internal"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: C[k], opacity: k === "internal" ? 0.5 : 1 }} />
          {t(`billable.kinds.${k}`)}
        </span>
      ))}
      <span>{t("billable.leaveExcluded")}</span>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
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
