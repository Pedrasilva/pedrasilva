import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { euros } from "@/lib/projects/gantt-utils";
import type { Project } from "@/lib/projects/types";
import { cn } from "@/lib/utils";

export type HealthStatus = "ok" | "warn" | "bad" | "none";

export interface HealthRow {
  project: Project;
  budget: number;
  actualRevenue: number;
  actualCost: number;
  /** Budget − actualCost. Negative = project has spent past its budget. */
  budgetRemaining: number;
  profit: number;
  marginPct: number;
  status: HealthStatus;
  /** Pre-translated status reason string. */
  statusReason: string;
}

const PAGE_SIZE = 10;

export function ProjectHealthTable({
  rows,
  loading,
  onOpenProject,
}: {
  rows: HealthRow[];
  loading?: boolean;
  onOpenProject?: (id: string) => void;
}) {
  const { t } = useTranslation("projects");
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"all" | HealthStatus>("all");

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("health.title")}
          </h2>
          <p className="text-[11px] text-muted-foreground">{t("health.subtitle")}</p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-1">
          {(["all", "ok", "warn", "bad"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium capitalize",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`health.filters.${f}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2 text-left font-medium">{t("health.columns.project")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("health.columns.budget")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("health.columns.actualRevenue")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("health.columns.actualCost")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("health.columns.profit")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("health.columns.margin")}</th>
              <th className="px-5 py-2 text-left font-medium">{t("health.columns.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  {t("health.loadingProjects")}
                </td>
              </tr>
            )}
            {!loading && paged.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  {t("health.emptyFilter")}
                </td>
              </tr>
            )}
            {paged.map((r) => (
              <tr key={r.project.id} className="hover:bg-accent/30">
                <td className="px-3 py-2.5 text-center">
                  <StatusDot status={r.status} />
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenProject?.(r.project.id)}
                    className="block min-w-0 text-left"
                  >
                    <p className="truncate text-sm font-medium text-primary hover:underline">
                      {r.project.name}
                    </p>
                    {r.project.client && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {r.project.client}
                      </p>
                    )}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                  {r.budget > 0 ? euros(r.budget) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-foreground">
                  {euros(r.actualRevenue)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-foreground">
                  {euros(r.actualCost)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-mono text-xs font-semibold",
                    r.profit < 0 ? "text-destructive" : "text-foreground",
                  )}
                >
                  {euros(r.profit)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <MarginBadge marginPct={r.marginPct} hasRevenue={r.actualRevenue > 0} />
                </td>
                <td className="px-5 py-2.5">
                  <span className="text-[11px] text-muted-foreground">{r.statusReason}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-end gap-3 border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
        <span>
          {filtered.length === 0
            ? "0 / 0"
            : `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, filtered.length)} / ${filtered.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
            aria-label={t("common.previousPage")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
            aria-label={t("common.nextPage")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    </section>
  );
}

function StatusDot({ status }: { status: HealthStatus }) {
  if (status === "none") {
    return (
      <span className="inline-block h-2.5 w-2.5 rounded-full border border-border bg-muted/40" />
    );
  }
  const cls =
    status === "ok"
      ? "bg-emerald-500"
      : status === "warn"
        ? "bg-amber-500"
        : "bg-destructive";
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background shadow-[0_0_0_1px_var(--color-border)]",
        cls,
      )}
    />
  );
}

function MarginBadge({ marginPct, hasRevenue }: { marginPct: number; hasRevenue: boolean }) {
  if (!hasRevenue) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const tone =
    marginPct < 0
      ? "bg-destructive text-destructive-foreground"
      : marginPct < 15
        ? "bg-amber-500 text-white"
        : "bg-emerald-500 text-white";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-[3rem] items-center justify-center rounded-md px-2 text-[11px] font-semibold",
        tone,
      )}
    >
      {Math.round(marginPct)}%
    </span>
  );
}
