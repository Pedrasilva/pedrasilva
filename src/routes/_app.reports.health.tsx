import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAllStages, useProjects, useResources } from "@/lib/projects/use-planner";
import { useResourceSchedules } from "@/lib/projects/use-resource-schedules";
import { effectiveCostRate, useDefaultResourceRates } from "@/lib/projects/use-default-rates";
import { addDays, TRACKING_START, type RosterPerson } from "@/lib/reports/hours-logged";
import { makeRateResolver, pctChange, type BPEntry } from "@/lib/reports/business-performance";
import { computeCompanyHealth, monthsIn, type Health, type HealthEntry } from "@/lib/reports/company-health";
import { useCompanyHealthData, useStudioCost } from "@/lib/reports/use-company-health";

export const Route = createFileRoute("/_app/reports/health")({
  head: () => ({
    meta: [
      { title: "Company health — PSA Hub Reports" },
      { name: "description", content: "Days, hours, full studio cost, value of work, break-even chargeability and where the studio loses money." },
      { property: "og:title", content: "Company health — PSA Hub Reports" },
      { property: "og:description", content: "Days, hours, full studio cost, value of work, break-even chargeability and where the studio loses money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HealthPage,
});

type Preset = "lastMonth" | "last2Months" | "last6Months" | "lastYear" | "custom";
const PRESETS: Preset[] = ["lastMonth", "last2Months", "last6Months", "lastYear", "custom"];
const C = { billable: "var(--chart-2)", nonBillable: "var(--chart-4)", internal: "var(--muted-foreground)", loss: "var(--destructive)", value: "var(--chart-1)", cost: "var(--chart-5)" };

function presetRange(p: Preset, back = 0): { start: string; end: string } {
  const today = new Date();
  const months = p === "lastMonth" ? 1 : p === "last2Months" ? 2 : p === "last6Months" ? 6 : 12;
  const shift = months * back;
  return {
    start: toLocalISODate(new Date(today.getFullYear(), today.getMonth() - months - shift, 1)),
    end: toLocalISODate(new Date(today.getFullYear(), today.getMonth() - shift, 0)),
  };
}

const eur = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
const h = (n: number) => `${Math.round(n).toLocaleString()} h`;
const p0 = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}%`);

function useHealth(start: string, end: string, dept: string, team: string) {
  const { data, isLoading, error } = useCompanyHealthData(start, end);
  const { data: schedules } = useResourceSchedules();
  const { data: stages } = useAllStages();
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const roster = data?.roster ?? [];
  const people = roster.filter((p) => (dept === "all" || p.department === dept) && (team === "all" || p.team === team));
  const filtered = dept !== "all" || team !== "all";
  const months = useMemo(() => (start && end && start <= end ? monthsIn(start, end) : []), [start, end]);
  const ids = filtered ? people.map((p) => p.collaboratorId).sort() : null;
  const cost = useStudioCost(data ? months : [], ids);

  const result = useMemo(() => {
    if (!data || !cost.data || !stages) return null;
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const resolver = makeRateResolver({
      taskToStage: data.taskToStage,
      stageRepResource: (sid) => stageById.get(sid)?.allocations[0]?.resource_id ?? null,
      resources,
      defaultRates,
    });
    const resById = new Map((resources ?? []).map((r) => [r.id, r]));
    const rates = cost.data.rates;
    const costRateAt = (rid: string | null | undefined, d: string) => {
      if (!rid) return 0;
      const hit = rates.filter((r) => r.resource_id === rid && r.valid_from <= d && (r.valid_to == null || d < r.valid_to)).sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
      if (hit) return hit.cost_rate;
      const r = resById.get(rid);
      return effectiveCostRate(r?.cost_rate, rid, defaultRates, !!r?.hourly_rate_is_override);
    };
    const stageOf = (e: HealthEntry) => (e.task_id ? stageById.get(data.taskToStage.get(e.task_id) ?? "") : undefined);
    const targetOf = (p: RosterPerson) => (p.resourceId ? schedules?.get(p.resourceId)?.targetChargeabilityPct ?? null : null);
    const base = {
      roster: people,
      entries: data.entries,
      leaveDays: data.leaveDays,
      holidays: data.holidays,
      targetOf,
      isBackOffice: (p: RosterPerson) => p.department === "Backoffice",
      ratesFor: (e: HealthEntry) => resolver(e as BPEntry),
      costRateAt,
      projectOf: (e: HealthEntry) => stageOf(e)?.project_id ?? null,
      isOwnWork: (e: HealthEntry) => (stageOf(e) as { is_self?: boolean | null } | undefined)?.is_self !== false,
      lostLeads: data.lostLeads,
    };
    const total = computeCompanyHealth({ ...base, start, end, fullCost: cost.data.months.reduce((a, m) => a + m.total, 0) });
    const monthly = months.map((m) => {
      const c = cost.data!.months.find((x) => x.key === m.key);
      return { key: m.key, cost: c, health: computeCompanyHealth({ ...base, start: m.start, end: m.end, fullCost: c?.total ?? 0 }) };
    });
    return { total, monthly };
  }, [data, cost.data, stages, resources, defaultRates, schedules, people, start, end, months]);

  return { data, result, cost: cost.data, isLoading: isLoading || cost.isLoading, error: error ?? cost.error, roster, noAccess: cost.data === null };
}

function HealthPage() {
  const { t, i18n } = useTranslation("reports");
  const [preset, setPreset] = useState<Preset>("last2Months");
  const [custom, setCustom] = useState(presetRange("lastMonth"));
  const [dept, setDept] = useState("all");
  const [team, setTeam] = useState("all");

  const yesterday = addDays(toLocalISODate(new Date()), -1);
  const raw = preset === "custom" ? { start: custom.start, end: custom.end > yesterday ? yesterday : custom.end } : presetRange(preset);
  const clamp = (r: { start: string; end: string }) => (r.end < TRACKING_START ? null : { start: r.start < TRACKING_START ? TRACKING_START : r.start, end: r.end });
  const range = clamp(raw);
  const prevRange = preset === "custom" ? null : clamp(presetRange(preset, 1));

  const cur = useHealth(range?.start ?? "", range?.end ?? "", dept, team);
  const prev = useHealth(prevRange?.start ?? "", prevRange?.end ?? "", dept, team);
  const teams = useMemo(() => [...new Set(cur.roster.map((r) => r.team).filter(Boolean) as string[])].sort(), [cur.roster]);
  const { data: projects } = useProjects();
  const projName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const monthLabel = (k: string) => new Date(k + "-01T00:00:00").toLocaleDateString(i18n.language, { month: "short", year: "2-digit" });

  const H = cur.result?.total;
  const P = prev.result?.total;

  return (
    <V2PermissionGate permission="reports.view" scope="all">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("health.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("health.subtitle")}</p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="space-y-1">
              <Label>{t("hours.filters.period")}</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{PRESETS.map((p) => <SelectItem key={p} value={p}>{t(`health.presets.${p}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {preset === "custom" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="ch-from">{t("hours.filters.from")}</Label>
                  <Input id="ch-from" type="date" min={TRACKING_START} value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ch-to">{t("hours.filters.to")}</Label>
                  <Input id="ch-to" type="date" min={TRACKING_START} max={yesterday} value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value > yesterday ? yesterday : e.target.value }))} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>{t("hours.filters.department")}</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("hours.filters.all")}</SelectItem>
                  <SelectItem value="Projecto">Projecto</SelectItem>
                  <SelectItem value="Backoffice">Backoffice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("hours.filters.team")}</Label>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("hours.filters.all")}</SelectItem>
                  {teams.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {range && <p className="text-xs text-muted-foreground">{t("health.range", { start: range.start, end: range.end })}</p>}
          </CardContent>
        </Card>

        {!range ? (
          <p className="text-sm text-muted-foreground">{t("health.beforeTracking")}</p>
        ) : cur.error ? (
          <p className="text-sm text-destructive">{t("health.error")}</p>
        ) : cur.noAccess ? (
          <p className="text-sm text-muted-foreground">{t("health.noAccess")}</p>
        ) : !H || cur.isLoading ? (
          <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : (
          <Body H={H} P={P ?? null} monthly={cur.result!.monthly} cost={cur.cost!} projName={projName} monthLabel={monthLabel} />
        )}
      </div>
    </V2PermissionGate>
  );
}

function Delta({ cur, prev, money }: { cur: number | null; prev: number | null | undefined; money?: boolean }) {
  const { t } = useTranslation("reports");
  if (cur == null || prev == null) return null;
  const txt = money ? pctChange(cur, prev) : cur - prev;
  if (txt == null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {t("health.vsPrevious")}: {txt >= 0 ? "+" : ""}{Math.round(txt)}{money ? "%" : " p.p."}
    </p>
  );
}

function Tile({ label, value, sub, tone, children }: { label: string; value: string; sub?: string; tone?: "good" | "bad"; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold", tone === "bad" && "text-destructive", tone === "good" && "text-[color:var(--chart-2)]")}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

function Funnel({ rows }: { rows: { label: string; value: number; unit: string; minus?: boolean; muted?: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(10rem,14rem)_1fr_6rem] items-center gap-3 text-sm">
          <span className={cn(r.muted && "text-muted-foreground")}>{r.minus ? "− " : ""}{r.label}</span>
          <div className="h-3 rounded bg-muted">
            <div className={cn("h-3 rounded", r.minus ? "bg-muted-foreground/50" : "bg-primary")} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">{Math.round(r.value).toLocaleString()} {r.unit}</span>
        </div>
      ))}
    </div>
  );
}

function Body({ H, P, monthly, cost, projName, monthLabel }: {
  H: Health;
  P: Health | null;
  monthly: { key: string; cost?: { projectSalary: number; backofficeSalary: number; opex: number; total: number; workingDays: number }; health: Health }[];
  cost: { inputs: { opexAnnual: number; diasUteis: number; people: number; projectPeople: number; backofficePeople: number; withoutSalary: number; opexShare: number }; months: { projectSalary: number; backofficeSalary: number; opex: number; total: number }[] };
  projName: Map<string, string>;
  monthLabel: (k: string) => string;
}) {
  const { t } = useTranslation("reports");
  const m = H.money;
  const ch = H.chargeability;
  const d = t("health.unitDays");
  const pdu = t("health.unitPersonDays");
  const sumCost = cost.months.reduce((a, x) => ({ p: a.p + x.projectSalary, b: a.b + x.backofficeSalary, o: a.o + x.opex }), { p: 0, b: 0, o: 0 });

  // Waterfall: cost blocks stack up to full cost, then value and result.
  const blocks: [string, number][] = [
    [t("health.blocks.billable"), m.blocks.billable],
    [t("health.blocks.nonBillable"), m.blocks.nonBillable],
    [t("health.blocks.internal"), m.blocks.internal],
    [t("health.blocks.unlogged"), m.blocks.unlogged],
    [t("health.blocks.leave"), m.blocks.leave],
    [t("health.blocks.estrutura"), m.blocks.estrutura],
  ];
  let acc = 0;
  const wf = blocks.map(([name, v]) => {
    const row = { name, base: Math.min(acc, acc + v), v: Math.abs(v), fill: C.cost };
    acc += v;
    return row;
  });
  wf.push({ name: t("health.blocks.fullCost"), base: 0, v: m.fullCost, fill: "var(--foreground)" });
  wf.push({ name: t("health.blocks.value"), base: 0, v: m.value, fill: C.value });
  wf.push({ name: t("health.blocks.result"), base: Math.min(m.value, m.fullCost), v: Math.abs(m.result), fill: m.result >= 0 ? C.billable : C.loss });

  const split = H.hours.split;
  const periodBar = [{ name: t("health.period"), billable: split.billable, nonBillable: split.nonBillable, internal: split.internal, unlogged: H.hours.unlogged }];
  const monthBars = monthly.map((x) => ({ name: monthLabel(x.key), billable: x.health.hours.split.billable, nonBillable: x.health.hours.split.nonBillable, internal: x.health.hours.split.internal, unlogged: x.health.hours.unlogged }));
  const trend = monthly.map((x) => ({
    name: monthLabel(x.key),
    result: Math.round(x.health.money.result),
    margin: x.health.money.marginPct == null ? null : Math.round(x.health.money.marginPct),
    charge: x.health.chargeability.ofAvailable == null ? null : Math.round(x.health.chargeability.ofAvailable),
    breakEven: x.health.chargeability.breakEven == null ? null : Math.round(x.health.chargeability.breakEven),
    unlogged: x.health.hours.unloggedPct == null ? null : Math.round(x.health.hours.unloggedPct),
  }));
  const hourBars = (
    <>
      <Bar dataKey="billable" stackId="a" name={t("health.kinds.billable")} fill={C.billable} />
      <Bar dataKey="nonBillable" stackId="a" name={t("health.kinds.nonBillable")} fill={C.nonBillable} />
      <Bar dataKey="internal" stackId="a" name={t("health.kinds.internal")} fill={C.internal} />
      <Bar dataKey="unlogged" stackId="a" name={t("health.kinds.unlogged")} fill={C.loss} fillOpacity={0.35} />
    </>
  );
  const unloggedCost = m.blocks.unlogged;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("health.tiles.result")} value={eur(m.result)} tone={m.result >= 0 ? "good" : "bad"} sub={t("health.tiles.margin", { pct: p0(m.marginPct) })}>
          <Delta cur={m.result} prev={P?.money.result} money />
        </Tile>
        <Tile label={t("health.tiles.value")} value={eur(m.value)} sub={t("health.tiles.valueSub")}>
          <Delta cur={m.value} prev={P?.money.value} money />
        </Tile>
        <Tile label={t("health.tiles.fullCost")} value={eur(m.fullCost)} sub={t("health.tiles.fullCostSub")}>
          <Delta cur={m.fullCost} prev={P?.money.fullCost} money />
        </Tile>
        <Card className="border-2 border-primary/40">
          <CardContent className="space-y-1 pt-4">
            <p className="text-xs text-muted-foreground">{t("health.tiles.breakEven")}</p>
            <p className={cn("text-2xl font-semibold", ch.ofAvailable != null && ch.breakEven != null && ch.ofAvailable < ch.breakEven && "text-destructive")}>
              {p0(ch.ofAvailable)} <span className="text-base font-normal text-muted-foreground">vs {p0(ch.breakEven)}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("health.tiles.breakEvenSub", { rate: eur(m.avgSaleRate) })}</p>
            <Delta cur={ch.ofAvailable} prev={P?.chargeability.ofAvailable} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("health.days.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <Funnel rows={[
              { label: t("health.days.total"), value: H.days.total, unit: d },
              { label: t("health.days.weekends"), value: H.days.weekends, unit: d, minus: true },
              { label: t("health.days.holidays"), value: H.days.holidays, unit: d, minus: true },
              { label: t("health.days.working"), value: H.days.working, unit: d },
            ]} />
            <Funnel rows={[
              { label: t("health.days.gross", { n: H.personDays.people }), value: H.personDays.gross, unit: pdu },
              { label: t("health.days.vacation"), value: H.personDays.vacation, unit: pdu, minus: true },
              { label: t("health.days.otherPaid"), value: H.personDays.otherPaid, unit: pdu, minus: true },
              { label: t("health.days.available"), value: H.personDays.available, unit: pdu },
              { label: t("health.days.unpaid"), value: H.personDays.unpaid, unit: pdu, muted: true },
            ]} />
            <p className="text-xs text-muted-foreground">{t("health.days.note")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("health.hours.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Funnel rows={[
              { label: t("health.hours.available"), value: H.hours.available, unit: "h" },
              { label: t("health.hours.logged"), value: H.hours.logged, unit: "h" },
              { label: t("health.hours.unlogged", { pct: p0(H.hours.unloggedPct) }), value: H.hours.unlogged, unit: "h", minus: true },
            ]} />
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{t("health.hours.chargeTeam", { actual: p0(ch.team), target: p0(ch.target) })}</p>
              <p className="text-muted-foreground">{t("health.hours.chargeStudio", { pct: p0(ch.studio) })}</p>
            </div>
            <div className="h-24">
              <ResponsiveContainer>
                <BarChart data={periodBar} layout="vertical" margin={{ left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip formatter={(v: number) => h(v)} />
                  {hourBars}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={monthBars}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => h(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {hourBars}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>{t("health.hours.internalCat")}</TableHead><TableHead className="text-right">h</TableHead></TableRow></TableHeader>
              <TableBody>
                {H.hours.internalByCategory.map((c) => <TableRow key={c.category}><TableCell>{c.category}</TableCell><TableCell className="text-right">{h(c.hours)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("health.money.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={wf}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number, k) => (k === "base" ? null : eur(v))} />
                <Bar dataKey="base" stackId="w" fill="transparent" />
                <Bar dataKey="v" stackId="w">{wf.map((x, i) => <Cell key={i} fill={x.fill} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {blocks.map(([n, v]) => <div key={n} className="flex justify-between"><span>{n}</span><span className="tabular-nums">{eur(v)}</span></div>)}
            <div className="flex justify-between font-medium"><span>{t("health.blocks.fullCost")}</span><span>{eur(m.fullCost)}</span></div>
            <div className="flex justify-between font-medium"><span>{t("health.blocks.value")}</span><span>{eur(m.value)}</span></div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("health.money.how", {
              people: cost.inputs.people,
              proj: cost.inputs.projectPeople,
              bo: cost.inputs.backofficePeople,
              projSal: eur(sumCost.p),
              boSal: eur(sumCost.b),
              opex: eur(sumCost.o),
              opexAnnual: eur(cost.inputs.opexAnnual),
              days: cost.inputs.diasUteis,
              share: Math.round(cost.inputs.opexShare * 100),
            })}
            {cost.inputs.withoutSalary > 0 && ` ${t("health.money.withoutSalary", { n: cost.inputs.withoutSalary })}`}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("health.losses.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableBody>
                {H.hours.internalByCategory.map((c) => (
                  <TableRow key={c.category}><TableCell>{t("health.losses.internal", { cat: c.category })}</TableCell><TableCell className="text-right">{h(c.hours)}</TableCell><TableCell className="text-right">{eur(c.cost)}</TableCell></TableRow>
                ))}
                <TableRow><TableCell>{t("health.losses.unlogged")}</TableCell><TableCell className="text-right">{h(H.hours.unlogged)}</TableCell><TableCell className="text-right">{eur(unloggedCost)}</TableCell></TableRow>
                <TableRow><TableCell>{t("health.losses.nonBillable")}</TableCell><TableCell className="text-right">{h(split.nonBillable)}</TableCell><TableCell className="text-right">{eur(m.blocks.nonBillable)}</TableCell></TableRow>
                <TableRow><TableCell>{t("health.losses.pursuitLost")}</TableCell><TableCell /><TableCell className="text-right">{eur(H.losses.pursuitLost)}</TableCell></TableRow>
              </TableBody>
            </Table>
            <p className="text-sm font-medium">{t("health.losses.projects")}</p>
            {H.losses.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("health.losses.noProjects")}</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>{t("health.losses.project")}</TableHead><TableHead className="text-right">{t("health.blocks.value")}</TableHead><TableHead className="text-right">{t("health.losses.cost")}</TableHead><TableHead className="text-right">{t("health.blocks.result")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {H.losses.projects.map((p) => (
                    <TableRow key={p.projectId}>
                      <TableCell><Link to="/projects/$projectId" params={{ projectId: p.projectId }} className="hover:underline">{projName.get(p.projectId) ?? "—"}</Link></TableCell>
                      <TableCell className="text-right">{eur(p.value)}</TableCell>
                      <TableCell className="text-right">{eur(p.cost)}</TableCell>
                      <TableCell className="text-right text-destructive">{eur(p.value - p.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("health.trends.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => eur(v)} />
                  <Bar dataKey="result" name={t("health.blocks.result")}>{trend.map((x, i) => <Cell key={i} fill={x.result >= 0 ? C.billable : C.loss} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} unit="%" />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="margin" name={t("health.trends.margin")} stroke={C.value} />
                  <Line dataKey="charge" name={t("health.trends.charge")} stroke={C.billable} />
                  <Line dataKey="breakEven" name={t("health.trends.breakEven")} stroke={C.loss} strokeDasharray="4 4" />
                  <Line dataKey="unlogged" name={t("health.trends.unlogged")} stroke={C.internal} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead /><TableHead className="text-right">{t("health.blocks.result")}</TableHead><TableHead className="text-right">{t("health.trends.margin")}</TableHead><TableHead className="text-right">{t("health.trends.charge")}</TableHead><TableHead className="text-right">{t("health.trends.breakEven")}</TableHead><TableHead className="text-right">{t("health.trends.unlogged")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {trend.map((x) => (
                  <TableRow key={x.name}>
                    <TableCell>{x.name}</TableCell>
                    <TableCell className={cn("text-right", x.result < 0 && "text-destructive")}>{eur(x.result)}</TableCell>
                    <TableCell className="text-right">{p0(x.margin)}</TableCell>
                    <TableCell className="text-right">{p0(x.charge)}</TableCell>
                    <TableCell className="text-right">{p0(x.breakEven)}</TableCell>
                    <TableCell className="text-right">{p0(x.unlogged)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
