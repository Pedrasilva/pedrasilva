import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { euros } from "@/lib/projects/gantt-utils";
import type { Project } from "@/lib/projects/types";
import { cn } from "@/lib/utils";

export interface ScorecardRow {
  project: Project;
  manager: string;
  managerSub?: string;
  budget: number;
  invoiced: number;
  usagePct: number;
  dueTone: "ok" | "warn" | "bad" | "none";
  activityTone: "ok" | "warn" | "bad" | "none";
}

const PAGE_SIZE = 8;

export function ProjectScorecard({
  rows,
  loading,
  onOpenProject,
}: {
  rows: ScorecardRow[];
  loading?: boolean;
  onOpenProject?: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [manager, setManager] = useState<string>("All");

  const managers = useMemo(() => {
    const set = new Set<string>(["All"]);
    rows.forEach((r) => set.add(r.manager));
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(
    () => (manager === "All" ? rows : rows.filter((r) => r.manager === manager)),
    [rows, manager],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Project Scorecard
        </h2>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Project Manager
          <select
            value={manager}
            onChange={(e) => {
              setManager(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {managers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-left font-medium">Project Manager</th>
              <th className="px-3 py-2 text-right font-medium">Budget</th>
              <th className="px-3 py-2 text-center font-medium">Usage</th>
              <th className="px-3 py-2 text-center font-medium">Due</th>
              <th className="px-5 py-2 text-center font-medium">Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  Loading projects…
                </td>
              </tr>
            )}
            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  No projects to score.
                </td>
              </tr>
            )}
            {paged.map((r) => (
              <tr key={r.project.id} className="hover:bg-accent/30">
                <td className="px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenProject?.(r.project.id)}
                    className="block min-w-0 text-left"
                  >
                    <p className="truncate text-sm font-medium text-primary hover:underline">
                      {r.project.name}
                    </p>
                    {r.project.client && (
                      <p className="truncate text-[11px] text-muted-foreground">{r.project.client}</p>
                    )}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-xs text-foreground">{r.manager}</p>
                  {r.managerSub && (
                    <p className="text-[11px] text-muted-foreground">{r.managerSub}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {r.budget > 0 ? (
                    <>
                      <p className="font-mono text-xs text-foreground">{euros(r.budget)}</p>
                      {r.invoiced > 0 && (
                        <p className="font-mono text-[11px] text-muted-foreground">
                          Inv. {euros(r.invoiced)}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <UsagePill pct={r.usagePct} hasBudget={r.budget > 0} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Dot tone={r.dueTone} />
                </td>
                <td className="px-5 py-2.5 text-center">
                  <Dot tone={r.activityTone} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-end gap-3 border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
        <span>
          {filtered.length === 0
            ? "0 of 0"
            : `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    </section>
  );
}

function UsagePill({ pct, hasBudget }: { pct: number; hasBudget: boolean }) {
  if (!hasBudget) {
    return (
      <span className="inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-md bg-muted px-2 text-[11px] font-semibold text-muted-foreground">
        %
      </span>
    );
  }
  const display = Math.round(pct * 100);
  const tone =
    pct > 1
      ? "bg-destructive text-destructive-foreground"
      : pct > 0.85
        ? "bg-amber-500 text-white"
        : pct > 0.4
          ? "bg-emerald-500 text-white"
          : "bg-primary/80 text-primary-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-[3rem] items-center justify-center rounded-md px-2 text-[11px] font-semibold",
        tone,
      )}
    >
      {display}%
    </span>
  );
}

function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "none" }) {
  if (tone === "none") {
    return <span className="inline-block h-3 w-3 rounded-full border border-border bg-muted/40" />;
  }
  const cls =
    tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-destructive";
  return (
    <span
      className={cn(
        "inline-block h-3 w-3 rounded-full ring-2 ring-background shadow-[0_0_0_1px_var(--color-border)]",
        cls,
      )}
    />
  );
}
