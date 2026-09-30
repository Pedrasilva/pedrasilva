import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toLocalISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { addDays, mondayOf, type HoursLoggedRow, type HoursStatus } from "@/lib/reports/hours-logged";
import { useHoursLogged } from "@/lib/reports/use-hours-logged";

export const Route = createFileRoute("/_app/reports/hours")({
  head: () => ({
    meta: [
      { title: "Hours logged — PSA Hub Reports" },
      { name: "description", content: "Expected vs logged hours per person, with weeks not submitted." },
      { property: "og:title", content: "Hours logged — PSA Hub Reports" },
      { property: "og:description", content: "Expected vs logged hours per person, with weeks not submitted." },
    ],
  }),
  component: HoursPage,
});

type Preset = "lastWeek" | "last2Weeks" | "lastMonth" | "last3Months" | "custom";
const PRESETS: Preset[] = ["lastWeek", "last2Weeks", "lastMonth", "last3Months", "custom"];

function presetRange(p: Preset): { start: string; end: string } {
  const today = new Date();
  const thisMonday = mondayOf(toLocalISODate(today));
  const lastSunday = addDays(thisMonday, -1);
  if (p === "lastWeek") return { start: addDays(thisMonday, -7), end: lastSunday };
  if (p === "last2Weeks") return { start: addDays(thisMonday, -14), end: lastSunday };
  const months = p === "lastMonth" ? 1 : 3;
  const start = new Date(today.getFullYear(), today.getMonth() - months, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  return { start: toLocalISODate(start), end: toLocalISODate(end) };
}

const STATUS_CLASS: Record<HoursStatus, string> = {
  onTrack: "bg-primary/15 text-primary border-primary/30",
  behind: "bg-accent text-accent-foreground border-border",
  farBehind: "bg-destructive/15 text-destructive border-destructive/30",
};

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

function HoursPage() {
  const { t } = useTranslation("reports");
  const [preset, setPreset] = useState<Preset>("last2Weeks");
  const [custom, setCustom] = useState(presetRange("last2Weeks"));
  const range = preset === "custom" ? custom : presetRange(preset);
  const [dept, setDept] = useState("all");
  const [team, setTeam] = useState("all");
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());

  const { data = [], isLoading, error } = useHoursLogged(range.start, range.end);

  const teams = useMemo(
    () => [...new Set(data.map((r) => r.person.team).filter(Boolean) as string[])].sort(),
    [data],
  );
  const rows = useMemo(
    () =>
      data
        .filter((r) => dept === "all" || r.person.department === dept)
        .filter((r) => team === "all" || r.person.team === team)
        .filter((r) => people.size === 0 || people.has(r.person.userId))
        .sort((a, b) => b.gap - a.gap),
    [data, dept, team, people],
  );

  const behind = rows.filter((r) => r.status !== "onTrack").length;
  const missing = rows.reduce((s, r) => s + Math.max(0, r.gap), 0);
  const notSubmitted = rows.reduce((s, r) => s + r.weeksNotSubmitted, 0);
  const chart = [...rows]
    .sort((a, b) => (a.pct ?? 1) - (b.pct ?? 1))
    .map((r) => ({ name: r.person.name, logged: r.logged, expected: r.expected }));

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  return (
    <V2PermissionGate permission="reports.view" scope="all">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("hours.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("hours.subtitle")}</p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="space-y-1">
              <Label>{t("hours.filters.period")}</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p} value={p}>{t(`hours.presets.${p}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {preset === "custom" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="rep-from">{t("hours.filters.from")}</Label>
                  <Input id="rep-from" type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rep-to">{t("hours.filters.to")}</Label>
                  <Input id="rep-to" type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} />
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
            <div className="flex flex-col gap-1">
              <Label>{t("hours.filters.people")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-44 justify-start">
                    <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                    {people.size === 0 ? t("hours.filters.everyone") : t("hours.filters.selected", { count: people.size })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {data.map((r) => (
                      <label key={r.person.userId} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                        <Checkbox checked={people.has(r.person.userId)} onCheckedChange={() => setPeople((s) => toggle(s, r.person.userId))} />
                        {r.person.name}
                      </label>
                    ))}
                  </div>
                  {people.size > 0 && (
                    <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setPeople(new Set())}>
                      {t("hours.filters.clear")}
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <p className="ml-auto text-xs text-muted-foreground">{t("hours.rangeLabel", { start: range.start, end: range.end })}</p>
          </CardContent>
        </Card>

        {error ? (
          <Card><CardContent className="py-8 text-center text-sm text-destructive">{t("hours.error")}</CardContent></Card>
        ) : isLoading ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            <Skeleton className="h-64" />
            <Skeleton className="h-80" />
          </div>
        ) : rows.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t("hours.empty")}</CardContent></Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label={t("hours.tiles.behind")} value={String(behind)} />
              <Tile label={t("hours.tiles.missing")} value={`${fmt(missing)} h`} />
              <Tile label={t("hours.tiles.notSubmitted")} value={String(notSubmitted)} />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("hours.chart.title")}</CardTitle></CardHeader>
              <CardContent style={{ height: Math.max(160, chart.length * 32 + 60) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${fmt(v)} h`} />
                    <Legend />
                    <Bar dataKey="expected" name={t("hours.cols.expected")} fill="var(--muted-foreground)" fillOpacity={0.3} barSize={10} />
                    <Bar dataKey="logged" name={t("hours.cols.logged")} fill="var(--primary)" barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{t("hours.cols.person")}</TableHead>
                    <TableHead className="text-right">{t("hours.cols.expected")}</TableHead>
                    <TableHead className="text-right">{t("hours.cols.logged")}</TableHead>
                    <TableHead className="text-right">{t("hours.cols.gap")}</TableHead>
                    <TableHead className="text-right">{t("hours.cols.pct")}</TableHead>
                    <TableHead className="text-right">{t("hours.cols.weeksNotSubmitted")}</TableHead>
                    <TableHead>{t("hours.cols.lastEntry")}</TableHead>
                    <TableHead>{t("hours.cols.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <PersonRow key={r.person.userId} row={r} open={open.has(r.person.userId)} onToggle={() => setOpen((s) => toggle(s, r.person.userId))} />
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </V2PermissionGate>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function PersonRow({ row, open, onToggle }: { row: HoursLoggedRow; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation("reports");
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <Fragment>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <button
            type="button"
            aria-label={open ? t("hours.collapse", { name: row.person.name }) : t("hours.expand", { name: row.person.name })}
            aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="h-4 w-4" />
          </button>
        </TableCell>
        <TableCell className="font-medium">{row.person.name}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(row.expected)}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(row.logged)}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(row.gap)}</TableCell>
        <TableCell className="text-right tabular-nums">{row.pct === null ? "—" : `${Math.round(row.pct * 100)}%`}</TableCell>
        <TableCell className="text-right tabular-nums">{row.weeksNotSubmitted}</TableCell>
        <TableCell>{row.lastEntryDate ?? t("hours.noEntry")}</TableCell>
        <TableCell>
          <Badge variant="outline" className={cn(STATUS_CLASS[row.status])}>{t(`hours.status.${row.status}`)}</Badge>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell />
          <TableCell colSpan={8}>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-medium">{t("hours.week.week")}</th>
                  <th className="text-right font-medium">{t("hours.cols.expected")}</th>
                  <th className="text-right font-medium">{t("hours.cols.logged")}</th>
                  <th className="text-right font-medium">{t("hours.week.leave")}</th>
                  <th className="pl-4 text-left font-medium">{t("hours.week.status")}</th>
                </tr>
              </thead>
              <tbody>
                {row.weeks.map((w) => (
                  <tr key={w.weekStart}>
                    <td className="py-1">{w.weekStart} → {w.weekEnd}</td>
                    <td className="text-right tabular-nums">{fmt(w.expected)}</td>
                    <td className="text-right tabular-nums">{fmt(w.logged)}</td>
                    <td className="text-right tabular-nums">{fmt(w.leave)}</td>
                    <td className="pl-4">{t(`hours.weekStatus.${w.status}`, { defaultValue: w.status })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
