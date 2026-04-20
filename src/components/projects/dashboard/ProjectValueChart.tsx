import { useMemo, useState } from "react";
import { addMonths, format, isSameMonth, parseISO, startOfMonth } from "date-fns";
import type { Project, StageWithAllocations } from "@/lib/projects/types";
import { allocationCost, allocationHours, euros } from "@/lib/projects/gantt-utils";
import { cn } from "@/lib/utils";

type Mode = "Criação" | "Início" | "Fim previsto" | "Concluído";
type Unit = "Horas" | "Valor";

interface Props {
  projects: Project[];
  stages: StageWithAllocations[];
  loading?: boolean;
}

export function ProjectValueChart({ projects, stages, loading }: Props) {
  const [mode, setMode] = useState<Mode>("Criação");
  const [unit, setUnit] = useState<Unit>("Horas");

  const stagesByProject = useMemo(() => {
    const m = new Map<string, StageWithAllocations[]>();
    for (const s of stages) {
      const arr = m.get(s.project_id) ?? [];
      arr.push(s);
      m.set(s.project_id, arr);
    }
    return m;
  }, [stages]);

  const projectSpans = useMemo(() => {
    return projects.map((p) => {
      const ps = stagesByProject.get(p.id) ?? [];
      let earliest: Date | null = null;
      let latest: Date | null = null;
      let value = 0;
      let hours = 0;
      for (const s of ps) {
        const sd = parseISO(s.start_date);
        const ed = parseISO(s.end_date);
        if (!earliest || sd < earliest) earliest = sd;
        if (!latest || ed > latest) latest = ed;
        for (const a of s.allocations) {
          value += allocationCost({
            start_date: a.start_date,
            end_date: a.end_date,
            hours_per_day: Number(a.hours_per_day),
            hourly_rate: Number(a.resource.hourly_rate),
          });
          hours += allocationHours({
            start_date: a.start_date,
            end_date: a.end_date,
            hours_per_day: Number(a.hours_per_day),
          });
        }
      }
      return {
        created: parseISO(p.created_at as unknown as string),
        commenced: earliest ?? parseISO(p.start_date),
        due: latest ?? parseISO(p.start_date),
        completed: latest ?? parseISO(p.start_date),
        value,
        hours,
      };
    });
  }, [projects, stagesByProject]);

  const buckets = useMemo(() => {
    const now = new Date();
    const months: { date: Date; total: number }[] = [];
    for (let i = -3; i <= 8; i++) {
      months.push({ date: startOfMonth(addMonths(now, i)), total: 0 });
    }
    for (const sp of projectSpans) {
      const ref =
        mode === "Criação"
          ? sp.created
          : mode === "Início"
            ? sp.commenced
            : mode === "Fim previsto"
              ? sp.due
              : sp.completed;
      const bucket = months.find((m) => isSameMonth(m.date, ref));
      if (!bucket) continue;
      bucket.total += unit === "Horas" ? sp.hours : sp.value;
    }
    return months;
  }, [projectSpans, mode, unit]);

  const max = Math.max(1, ...buckets.map((b) => b.total));

  return (
    <section className="flex h-full flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Valor por projecto
        </h2>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Mostrar
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option>Horas</option>
            <option>Valor</option>
          </select>
        </label>
      </header>

      <div className="flex gap-1 border-b border-border px-5 py-2">
        {(["Criação", "Início", "Fim previsto", "Concluído"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium",
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            A carregar…
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex flex-1 items-end gap-2">
              {buckets.map((b, i) => {
                const h = max > 0 ? (b.total / max) * 100 : 0;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {b.total > 0
                        ? unit === "Horas"
                          ? Math.round(b.total)
                          : euros(b.total)
                        : "0"}
                    </span>
                    <div className="relative w-full flex-1">
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-t-sm bg-primary/80"
                        style={{ height: `${h}%`, minHeight: b.total > 0 ? 2 : 0 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2 border-t border-border pt-2">
              {buckets.map((b, i) => (
                <div
                  key={i}
                  className="flex-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  {format(b.date, "MMM yy")}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
