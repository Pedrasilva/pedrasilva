/**
 * Calendar suggestions inside the weekly timesheet grid (own timesheet only).
 * Top-row day badge with the day's unlogged events (Registar / Dispensar) and
 * the small per-row hint for events matched to exactly one project or lead.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatHM, parseHM } from "@/lib/projects/time-format";
import type { GridCalendarEvent } from "@/lib/projects/calendar.functions";

/** Time covered by the events (overlaps merged, per day), in hours. */
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const sumH = (evs: GridCalendarEvent[]) => {
  const byDay = new Map<string, Array<[number, number]>>();
  for (const e of evs) {
    const s = toMin(e.start);
    let en = toMin(e.end);
    if (en <= s) en = s + e.minutes;
    const list = byDay.get(e.date) ?? [];
    list.push([s, en]);
    byDay.set(e.date, list);
  }
  let total = 0;
  for (const list of byDay.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let [cs, ce] = list[0];
    for (const [s, en] of list.slice(1)) {
      if (s <= ce) ce = Math.max(ce, en);
      else { total += ce - cs; cs = s; ce = en; }
    }
    total += ce - cs;
  }
  return total / 60;
};
const hm = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

export function CalendarBadgeLabel({ events }: { events: GridCalendarEvent[] }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px]">
      <CalendarDays className="h-3 w-3" />
      {events.length} · +{hm(sumH(events))}
    </span>
  );
}

export function CalendarDayBadge({
  events,
  onDismiss,
  picker,
}: {
  events: GridCalendarEvent[];
  onDismiss: (id: string) => Promise<void>;
  picker: (ev: GridCalendarEvent, hours: number, done: () => void) => ReactNode;
}) {
  const { t } = useTranslation("projects");
  const [open, setOpen] = useState(false);
  const [reg, setReg] = useState<GridCalendarEvent | null>(null);
  const [hoursText, setHoursText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (!events.length) return <span className="text-[10px] text-muted-foreground/50">—</span>;
  const hours = parseHM(hoursText);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setReg(null); }}>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20">
          <CalendarBadgeLabel events={events} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[min(420px,calc(100vw-1rem))] p-0">
        {reg ? (
          <div>
            <div className="space-y-2 border-b border-border px-3 py-2">
              <button type="button" className="text-xs text-primary" onClick={() => setReg(null)}>← {t("tsCalendar.back")}</button>
              <div className="truncate text-sm font-medium">{reg.title || t("tsCalendar.untitled")}</div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t("tsCalendar.hours")}
                <Input value={hoursText} onChange={(e) => setHoursText(e.target.value)} className="h-8 w-24 font-mono" />
              </label>
            </div>
            {hours !== null && hours > 0 && hours <= 24 ? (
              picker(reg, hours, () => { setReg(null); setOpen(false); })
            ) : (
              <p className="px-3 py-3 text-xs text-destructive">{t("tsCalendar.badHours")}</p>
            )}
          </div>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.title || t("tsCalendar.untitled")}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {e.start}–{e.end} · {formatHM(e.minutes / 60)}
                  </div>
                </div>
                <Button size="sm" className="h-8" onClick={() => { setHoursText(formatHM(e.minutes / 60)); setReg(e); }}>
                  {t("tsCalendar.register")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={busy === e.id}
                  onClick={async () => { setBusy(e.id); try { await onDismiss(e.id); } finally { setBusy(null); } }}
                >
                  {busy === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("tsCalendar.dismiss")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export type HintTarget = { key: string; label: string };

export function CalendarRowHint({
  events,
  targets,
  onAdd,
}: {
  events: GridCalendarEvent[];
  targets: HintTarget[];
  onAdd: (targetKey: string) => Promise<void>;
}) {
  const { t } = useTranslation("projects");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!events.length || !targets.length) return null;
  const run = async (key: string) => {
    setBusy(true);
    try { await onAdd(key); } finally { setBusy(false); setOpen(false); }
  };
  const cls = "mt-0.5 rounded-full border border-primary/30 bg-primary/5 px-1.5 text-primary hover:bg-primary/15 disabled:opacity-50";
  const title = events.map((e) => `${e.start}–${e.end} ${e.title}`).join("\n");
  if (targets.length === 1)
    return (
      <button type="button" disabled={busy} className={cls} title={title} onClick={() => run(targets[0].key)}>
        <CalendarBadgeLabel events={events} />
      </button>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={busy} className={cls} title={title}>
          <CalendarBadgeLabel events={events} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1">
        <div className="px-2 py-1 text-[11px] text-muted-foreground">{t("tsCalendar.chooseRow")}</div>
        {targets.map((tg) => (
          <button key={tg.key} type="button" disabled={busy} className="flex min-h-10 w-full items-center rounded px-2 text-left text-sm hover:bg-accent" onClick={() => run(tg.key)}>
            {tg.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
