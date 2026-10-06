/**
 * HR → Ausências e férias → Calendário anual. Display only: reads the same
 * requests/collaborators the page already loaded (no change to who sees whom),
 * never writes leave data. Selection is remembered per user in localStorage.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enGB, pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Estado = "pendente" | "aprovada" | "rejeitada" | "cancelada";
export type CalRequest = { id: string; collaborator_id: string; tipo: string; data_inicio: string; data_fim: string; estado: Estado; dias_uteis: number | null };
export type CalCollaborator = {
  id: string;
  nome: string;
  departamento?: string | null;
  dias_ferias_anuais?: number | null;
  saldo_ferias_anterior?: number | null;
  dias_ferias_extra?: number | null;
};

/** Colour-blind-friendly categorical palette (Okabe–Ito + Paul Tol), all distinct. Data-viz only. */
const PALETTE = [
  "#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#882255",
  "#44AA99", "#999933", "#332288", "#AA4499", "#117733", "#DDCC77", "#88CCEE", "#777777",
  "#661100", "#6699CC", "#AA4466", "#4477AA",
];
const initials = (n: string) => {
  const w = n.split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};

type DayEntry = { req: CalRequest; collab: string };

export function YearLeaveCalendar({
  year, onYearChange, requests, collaborators, holidayDates, userId, myCollabId, typeLabel, onOpenPerson,
}: {
  year: number;
  onYearChange: (y: number) => void;
  requests: CalRequest[];
  collaborators: CalCollaborator[];
  holidayDates: Set<string>;
  userId: string | null;
  myCollabId: string | null;
  typeLabel: (tipo: string) => string;
  /** Opens that person's request list. */
  onOpenPerson: (collabId: string) => void;
}) {
  const { t, i18n } = useTranslation("hr");
  const k = (s: string) => `annualCal.${s}`;
  const locale = i18n.language?.startsWith("pt") ? pt : enGB;

  // Stable distinct colour per person (alphabetical order of everyone the page shows).
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    [...collaborators].sort((a, b) => a.nome.localeCompare(b.nome)).forEach((c, i) => m.set(c.id, PALETTE[i % PALETTE.length]));
    return m;
  }, [collaborators]);
  const nameOf = (id: string) => collaborators.find((c) => c.id === id)?.nome ?? "—";

  // Selection: empty = everyone. Remembered per user.
  const storeKey = userId ? `hr-annual-cal-sel:${userId}` : null;
  const [selected, setSelected] = useState<string[]>([]);
  const [dept, setDept] = useState<string>("all");
  useEffect(() => {
    if (!storeKey) return;
    try {
      const v = JSON.parse(localStorage.getItem(storeKey) ?? "null") as { ids?: string[]; dept?: string } | null;
      if (v?.ids) setSelected(v.ids);
      if (v?.dept) setDept(v.dept);
    } catch { /* ignore */ }
  }, [storeKey]);
  useEffect(() => {
    if (storeKey) localStorage.setItem(storeKey, JSON.stringify({ ids: selected, dept }));
  }, [storeKey, selected, dept]);

  const depts = useMemo(() => [...new Set(collaborators.map((c) => c.departamento).filter(Boolean) as string[])].sort(), [collaborators]);
  const inDept = (id: string) => dept === "all" || collaborators.find((c) => c.id === id)?.departamento === dept;
  const visible = (id: string) => inDept(id) && (selected.length === 0 || selected.includes(id));

  // Only working days count: weekends and public holidays are never marked.
  const byDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const r of requests) {
      if (r.estado === "rejeitada" || r.estado === "cancelada") continue;
      const end = new Date(r.data_fim + "T00:00:00");
      for (let d = new Date(r.data_inicio + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() !== year) continue;
        const wd = d.getDay();
        const key = format(d, "yyyy-MM-dd");
        if (wd === 0 || wd === 6 || holidayDates.has(key)) continue;
        map.set(key, [...(map.get(key) ?? []), { req: r, collab: r.collaborator_id }]);
      }
    }
    return map;
  }, [requests, year, holidayDates]);

  const legendIds = useMemo(() => {
    const ids = new Set<string>();
    byDay.forEach((arr) => arr.forEach((e) => ids.add(e.collab)));
    for (const s of selected) ids.add(s);
    return [...ids].filter(inDept).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay, selected, dept, collaborators]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Totals when exactly one person is selected — same formula as "Saldo de férias".
  const one = selected.length === 1 ? collaborators.find((c) => c.id === selected[0]) ?? null : null;
  const totals = useMemo(() => {
    if (!one) return null;
    const sum = (estado: Estado) =>
      requests
        .filter((r) => r.collaborator_id === one.id && r.estado === estado && r.tipo === "ferias" && new Date(r.data_inicio).getFullYear() === year)
        .reduce((a, r) => a + (r.dias_uteis || 0), 0);
    const approved = sum("aprovada");
    const pending = sum("pendente");
    const total = (one.dias_ferias_anuais ?? 0) + (one.saldo_ferias_anterior ?? 0) + (one.dias_ferias_extra ?? 0);
    return { approved, pending, balance: total - approved - pending };
  }, [one, requests, year]);

  const statusLabel = (e: Estado) => t(k(`status.${e}`));
  const kindLabel = (tipo: string) => (tipo === "ferias" ? t(k("kind.vacation")) : t(k("kind.other"), { type: typeLabel(tipo) }));
  const weekdays = t(k("weekdays")).split(",");

  const DayList = ({ entries, links }: { entries: DayEntry[]; links?: boolean }) => (
    <ul className="space-y-1 text-xs">
      {entries.map((e) => (
        <li key={e.req.id} className="flex items-center gap-2">
          <Mark color={colorOf.get(e.collab)!} pending={e.req.estado === "pendente"} other={e.req.tipo !== "ferias"} />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{nameOf(e.collab)}</span> · {kindLabel(e.req.tipo)} · {statusLabel(e.req.estado)}
          </span>
          {links && (
            <button type="button" className="shrink-0 text-primary underline-offset-2 hover:underline" onClick={() => onOpenPerson(e.collab)}>
              {t(k("openRequests"))}
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onYearChange(year - 1)} aria-label={t(k("prevYear"))}>←</Button>
          <div className="min-w-[5rem] text-center text-sm font-medium tabular-nums">{year}</div>
          <Button variant="outline" size="sm" onClick={() => onYearChange(year + 1)} aria-label={t(k("nextYear"))}>→</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={selected.length === 0 && dept === "all" ? "default" : "outline"} onClick={() => { setSelected([]); setDept("all"); }}>
            {t(k("all"))}
          </Button>
          {myCollabId && (
            <Button size="sm" variant={selected.length === 1 && selected[0] === myCollabId ? "default" : "outline"} onClick={() => { setSelected([myCollabId]); setDept("all"); }}>
              {t(k("onlyMe"))}
            </Button>
          )}
          {depts.length > 0 && (
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="h-8 w-44 text-xs" aria-label={t(k("department"))}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(k("allDepartments"))}</SelectItem>
                {depts.map((d) => <SelectItem key={d} value={d}>{t(`annualCal.dept.${d}`, { defaultValue: d })}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {legendIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t(k("people"))}>
          {legendIds.map((id) => {
            const on = selected.length === 0 || selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected.includes(id)}
                onClick={() => toggle(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  selected.includes(id) ? "border-primary bg-accent" : "border-border",
                  !on && "opacity-50",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf.get(id) }} />
                {nameOf(id)}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Mark color="currentColor" /> {t(k("legend.approved"))}</span>
        <span className="inline-flex items-center gap-1.5"><Mark color="currentColor" pending /> {t(k("legend.pending"))}</span>
        <span className="inline-flex items-center gap-1.5"><Mark color="currentColor" other /> {t(k("legend.other"))}</span>
        <span>{t(k("legend.workingDays"))}</span>
      </div>

      {one && totals && (
        <div className="grid grid-cols-3 gap-3 rounded-md border p-3 text-sm">
          <div><div className="text-xs text-muted-foreground">{t(k("totals.approved"))}</div><div className="text-lg font-semibold tabular-nums">{totals.approved}</div></div>
          <div><div className="text-xs text-muted-foreground">{t(k("totals.pending"))}</div><div className="text-lg font-semibold tabular-nums">{totals.pending}</div></div>
          <div><div className="text-xs text-muted-foreground">{t(k("totals.balance"))}</div><div className="text-lg font-semibold tabular-nums">{totals.balance}</div></div>
          <div className="col-span-3 text-[11px] text-muted-foreground">{t(k("totals.caption"), { name: one.nome, year })}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, m) => {
          const first = new Date(year, m, 1);
          const dim = new Date(year, m + 1, 0).getDate();
          const cells: (number | null)[] = [...Array((first.getDay() + 6) % 7).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
          return (
            <div key={m} className="rounded-md border p-2">
              <div className="mb-1 px-1 text-xs font-semibold capitalize">{format(first, "LLLL", { locale })}</div>
              <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground">
                {weekdays.map((d, i) => <div key={i} className="text-center">{d}</div>)}
              </div>
              <div className="mt-0.5 grid grid-cols-7 gap-0.5">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={idx} className="aspect-square" />;
                  const dateStr = format(new Date(year, m, day), "yyyy-MM-dd");
                  const wd = new Date(year, m, day).getDay();
                  const isWeekend = wd === 0 || wd === 6;
                  const isHoliday = holidayDates.has(dateStr);
                  const entries = (byDay.get(dateStr) ?? []).filter((e) => visible(e.collab));
                  const cell = (
                    <div
                      className={cn(
                        "relative flex aspect-square w-full flex-col items-center justify-start rounded-sm px-0.5 pt-0.5 text-[10px] tabular-nums",
                        isWeekend && "text-muted-foreground/60",
                        isHoliday && "font-semibold text-destructive",
                        !isWeekend && !isHoliday && "bg-muted/30",
                        entries.length > 0 && "cursor-pointer hover:bg-accent",
                      )}
                      title={entries.length ? entries.map((e) => `${initials(nameOf(e.collab))} ${nameOf(e.collab)} · ${kindLabel(e.req.tipo)} · ${statusLabel(e.req.estado)}`).join("\n") : undefined}
                    >
                      <span>{day}</span>
                      {entries.length > 0 && (
                        <div className="mt-auto flex w-full flex-wrap justify-center gap-[2px] pb-0.5">
                          {entries.slice(0, 4).map((e) => (
                            <Mark key={e.req.id} color={colorOf.get(e.collab)!} pending={e.req.estado === "pendente"} other={e.req.tipo !== "ferias"} small />
                          ))}
                          {entries.length > 4 && <span className="text-[8px] leading-none">+{entries.length - 4}</span>}
                        </div>
                      )}
                    </div>
                  );
                  if (!entries.length) return <div key={idx}>{cell}</div>;
                  return (
                    <Popover key={idx}>
                      <PopoverTrigger asChild><button type="button" className="block w-full" aria-label={format(new Date(year, m, day), "PPP", { locale })}>{cell}</button></PopoverTrigger>
                      <PopoverContent className="w-72 p-3">
                        <div className="mb-2 text-xs font-semibold">{format(new Date(year, m, day), "EEEE, d MMMM", { locale })}</div>
                        <DayList entries={entries} links />
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Filled = approved; outlined ring = pending; square = other absence (not vacation). */
function Mark({ color, pending, other, small }: { color: string; pending?: boolean; other?: boolean; small?: boolean }) {
  const size = small ? "h-1.5 w-1.5" : "h-2.5 w-2.5";
  return (
    <span
      aria-hidden
      className={cn(size, "inline-block shrink-0 border", other ? "rounded-[1px]" : "rounded-full")}
      style={pending ? { borderColor: color, backgroundColor: "transparent", borderWidth: small ? 1 : 2 } : { borderColor: color, backgroundColor: color }}
    />
  );
}
