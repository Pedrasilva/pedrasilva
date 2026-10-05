import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { addDays, mondayOf } from "@/lib/reports/hours-logged";
import { bandFor, computeCapacityForecast, type CfCell, type LoadBand } from "@/lib/reports/capacity-forecast";
import { useCapacityForecastData } from "@/lib/reports/use-capacity-forecast";

export const Route = createFileRoute("/_app/reports/capacity")({
  head: () => ({
    meta: [
      { title: "Capacity forecast — PSA Hub Reports" },
      { name: "description", content: "Planned vs available hours per person for the coming weeks, with unassigned demand." },
      { property: "og:title", content: "Capacity forecast — PSA Hub Reports" },
      { property: "og:description", content: "Planned vs available hours per person for the coming weeks, with unassigned demand." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapacityPage,
});

const BAND_CLS: Record<LoadBand, string> = {
  low: "bg-muted text-muted-foreground",
  ok: "bg-chart-2/30",
  high: "bg-chart-4/40",
  over: "bg-destructive/30",
};
const fmtH = (n: number) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
const fmtP = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

function CapacityPage() {
  const { t, i18n } = useTranslation("reports");
  const [nWeeks, setNWeeks] = useState("8");
  const [dept, setDept] = useState("all");
  const [team, setTeam] = useState("all");
  const [project, setProject] = useState("all");
  const [openUser, setOpenUser] = useState<string | null>(null);

  const start = mondayOf(toLocalISODate(new Date()));
  const end = addDays(start, Number(nWeeks) * 7 - 1);
  const { data, isLoading, error } = useCapacityForecastData(start, end);

  const projects = useMemo(() => {
    const m = new Map<string, string>();
    data?.stages.forEach((s) => m.set(s.project_id, s.projectLabel));
    const used = new Set((data?.allocations ?? []).map((a) => data?.stages.get(a.stage_id)?.project_id));
    return [...m].filter(([id]) => used.has(id)).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const teams = useMemo(() => [...new Set((data?.roster ?? []).map((r) => r.team).filter(Boolean) as string[])].sort(), [data]);

  const result = useMemo(() => {
    if (!data) return null;
    const roster = data.roster.filter((p) => (dept === "all" || p.department === dept) && (team === "all" || p.team === team));
    const stages = project === "all" ? data.stages : new Map([...data.stages].filter(([, s]) => s.project_id === project));
    const r = computeCapacityForecast({ rangeStart: start, rangeEnd: end, roster, nonWorking: data.nonWorking, holidays: data.holidays, allocations: data.allocations, stages, placeholders: data.placeholders });
    if (project !== "all") r.people = r.people.filter((p) => p.planned > 0);
    return r;
  }, [data, dept, team, project, start, end]);

  const fmtWeek = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(i18n.language, { day: "numeric", month: "short" });

  const tiles = useMemo(() => {
    if (!result) return null;
    const first4 = result.team.slice(0, 4);
    const av = first4.reduce((s, w) => s + w.available, 0);
    const pl = first4.reduce((s, w) => s + w.planned, 0);
    const loads = result.people.map((p) => (p.available > 0 ? p.planned / p.available : null));
    return {
      avg: av > 0 ? pl / av : null,
      over: loads.filter((l) => l != null && l > 1.1).length,
      under: loads.filter((l) => l != null && l < 0.5).length,
      unassigned: result.team.reduce((s, w) => s + w.unassigned, 0),
    };
  }, [result]);

  const open = result?.people.find((p) => p.person.userId === openUser) ?? null;

  return (
    <V2PermissionGate permission="reports.view" scope="all">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("capacity.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("capacity.subtitle")}</p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="space-y-1">
              <Label>{t("hours.filters.period")}</Label>
              <Select value={nWeeks} onValueChange={setNWeeks}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["4", "8", "12"].map((n) => <SelectItem key={n} value={n}>{t("capacity.nextWeeks", { count: Number(n) })}</SelectItem>)}
                </SelectContent>
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
              <Label>{t("capacity.project")}</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("hours.filters.all")}</SelectItem>
                  {projects.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="ml-auto text-xs text-muted-foreground">{t("hours.rangeLabel", { start, end })}</p>
          </CardContent>
        </Card>

        {error ? (
          <Card><CardContent className="py-8 text-center text-sm text-destructive">{t("hours.error")}</CardContent></Card>
        ) : isLoading || !result || !tiles ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            <Skeleton className="h-64" />
            <Skeleton className="h-80" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label={t("capacity.tiles.avg")} value={fmtP(tiles.avg)} />
              <Tile label={t("capacity.tiles.over")} value={String(tiles.over)} />
              <Tile label={t("capacity.tiles.under")} value={String(tiles.under)} />
              <Tile label={t("capacity.tiles.unassigned")} value={`${fmtH(tiles.unassigned)} h`} />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("capacity.chart.title")}</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={result.team.map((w) => ({ week: fmtWeek(w.weekStart), available: w.available, planned: w.planned, unassigned: w.unassigned }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" fontSize={11} />
                    <YAxis fontSize={11} />
                    <RTooltip formatter={(v: number) => `${fmtH(v)} h`} />
                    <Legend />
                    <Area type="monotone" stackId="d" dataKey="planned" name={t("capacity.chart.planned")} stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.35} />
                    <Area type="monotone" stackId="d" dataKey="unassigned" name={t("capacity.unassigned")} stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.35} />
                    <Line type="monotone" dataKey="available" name={t("capacity.chart.available")} stroke="var(--foreground)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("capacity.heatmap.title")}</CardTitle>
                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  {(["low", "ok", "high", "over"] as LoadBand[]).map((b) => (
                    <span key={b} className="flex items-center gap-1"><span className={cn("inline-block h-3 w-3 rounded-sm", BAND_CLS[b])} />{t(`capacity.band.${b}`)}</span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {result.people.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t("hours.empty")}</p>
                ) : (
                  <TooltipProvider delayDuration={100}>
                    <table className="w-full border-separate border-spacing-1 text-xs">
                      <thead>
                        <tr>
                          <th className="text-left font-medium text-muted-foreground">{t("hours.cols.person")}</th>
                          {result.team.map((w) => <th key={w.weekStart} className="font-medium text-muted-foreground">{fmtWeek(w.weekStart)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {result.people.map((r) => (
                          <tr key={r.person.userId}>
                            <td className="whitespace-nowrap pr-2">
                              <button type="button" className="text-left hover:underline" onClick={() => setOpenUser(r.person.userId)}>{r.person.name}</button>
                            </td>
                            {r.weeks.map((c) => <HeatCell key={c.weekStart} cell={c} />)}
                          </tr>
                        ))}
                        <tr>
                          <td className="pr-2 font-medium">{t("capacity.team")}</td>
                          {result.team.map((w) => (
                            <td key={w.weekStart} className="text-center font-mono font-medium">{fmtP(w.load)}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </TooltipProvider>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Sheet open={!!open} onOpenChange={(o) => !o && setOpenUser(null)}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
            {open && (
              <>
                <SheetHeader><SheetTitle>{open.person.name}</SheetTitle></SheetHeader>
                <Table className="mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hours.week.week")}</TableHead>
                      <TableHead>{t("capacity.detail.projectStage")}</TableHead>
                      <TableHead className="text-right">{t("capacity.chart.planned")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {open.weeks.map((w) => (
                      <TableRow key={w.weekStart} className="align-top">
                        <TableCell className="whitespace-nowrap">
                          {fmtWeek(w.weekStart)}
                          <div className="text-[11px] text-muted-foreground">{fmtH(w.planned)} / {fmtH(w.available)} h · {fmtP(w.load)}</div>
                        </TableCell>
                        <TableCell>
                          {w.items.length === 0 ? <span className="text-muted-foreground">{t("capacity.detail.none")}</span> : w.items.map((i) => (
                            <div key={i.stageId}>{i.projectLabel} · <span className="text-muted-foreground">{i.stageLabel}</span></div>
                          ))}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {w.items.map((i) => <div key={i.stageId}>{fmtH(i.hours)}</div>)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </V2PermissionGate>
  );
}

function HeatCell({ cell }: { cell: CfCell }) {
  const { t } = useTranslation("reports");
  const band = bandFor(cell.load);
  return (
    <td className="p-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("min-w-12 rounded px-1 py-1.5 text-center font-mono", band ? BAND_CLS[band] : "text-muted-foreground")}>
            {cell.available > 0 ? fmtP(cell.load) : "—"}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <p className="font-medium">{t("capacity.cell", { planned: fmtH(cell.planned), available: fmtH(cell.available) })}</p>
          {cell.items.map((i) => <p key={i.stageId}>{i.projectLabel} · {i.stageLabel}: {fmtH(i.hours)} h</p>)}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
