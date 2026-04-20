import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMyResourceId } from "@/lib/projects/use-my-resource";
import { useTimesheetRows, useTimesheetEntries, useUpsertTimesheetCell } from "@/lib/projects/use-timesheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatHM } from "@/lib/projects/time-format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/projects/timesheet")({
  component: TimesheetPage,
});

function TimesheetPage() {
  const { user } = useAuth();
  const { data: resourceId } = useMyResourceId();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());

  const weekStartDate = useMemo(() => startOfWeek(weekAnchor, { weekStartsOn: 1 }), [weekAnchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)), [weekStartDate]);
  const weekStart = format(weekStartDate, "yyyy-MM-dd");
  const weekEnd = format(addDays(weekStartDate, 6), "yyyy-MM-dd");

  const { data: rows = [], isLoading } = useTimesheetRows({
    resourceId: resourceId ?? null,
    userId: user?.id ?? null,
    weekStart,
    weekEnd,
    extraTaskIds: [],
  });
  const { data: entries = [] } = useTimesheetEntries({
    userId: user?.id ?? null,
    weekStart,
    weekEnd,
  });
  const upsert = useUpsertTimesheetCell();

  const entryMap = useMemo(() => {
    const m = new Map<string, Map<string, { id: string; hours: number; notes: string | null }>>();
    for (const e of entries) {
      if (!m.has(e.task_id)) m.set(e.task_id, new Map());
      m.get(e.task_id)!.set(e.entry_date, { id: e.id, hours: e.hours, notes: e.notes });
    }
    return m;
  }, [entries]);

  const noResource = !resourceId;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-8">
      <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Projectos
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Timesheet semanal</h1>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setWeekAnchor((d) => addWeeks(d, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <button onClick={() => setWeekAnchor(new Date())} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
            <CalendarDays className="h-3.5 w-3.5" />
            {format(weekStartDate, "MMM d")} – {format(addDays(weekStartDate, 6), "MMM d, yyyy")}
          </button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setWeekAnchor((d) => addWeeks(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {noResource ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          A tua conta ainda não está ligada a um membro da equipa.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Projecto · Fase</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="px-2 py-2 text-center font-medium">
                    <div>{format(d, "EEE")}</div>
                    <div className="text-foreground/80">{format(d, "MMM d")}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">A carregar…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Sem fases activas esta semana.</td></tr>
              )}
              {rows.map((r) => {
                const cells = entryMap.get(r.task_id);
                let total = 0;
                cells?.forEach((c) => { total += c.hours; });
                return (
                  <tr key={r.task_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-1.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: r.project.color }} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{r.project.name}{r.project.client ? <span className="text-muted-foreground"> · {r.project.client}</span> : null}</div>
                          <div className="truncate text-[12px] font-medium" style={{ color: r.stage.color }}>{r.stage.name}</div>
                        </div>
                      </div>
                    </td>
                    {days.map((d) => {
                      const dateStr = format(d, "yyyy-MM-dd");
                      const cell = cells?.get(dateStr);
                      return (
                        <td key={dateStr} className="px-1 py-1 text-center">
                          <Input
                            type="number"
                            step={0.25}
                            min={0}
                            defaultValue={cell?.hours ?? ""}
                            onBlur={(e) => {
                              const h = Number(e.target.value);
                              if (!Number.isFinite(h)) return;
                              if (!user?.id) return;
                              upsert.mutate(
                                {
                                  task_id: r.task_id,
                                  user_id: user.id,
                                  entry_date: dateStr,
                                  hours: h,
                                  notes: cell?.notes ?? null,
                                  existing_entry_id: cell?.id ?? null,
                                },
                                { onError: (err) => toast.error((err as Error).message) },
                              );
                            }}
                            className="h-8 w-16 text-center font-mono text-xs"
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-mono text-sm">{formatHM(total) || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
