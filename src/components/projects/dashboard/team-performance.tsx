import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";

type SortKey = "name" | "utilization" | "billable";

export interface TeamRow {
  resourceId: string;
  name: string;
  capacityHours: number;
  billableHours: number;
  internalHours: number;
  nonWorkingHours: number;
  collaboratorId?: string | null;
  fotoPath?: string | null;
  color?: string | null;
}

export function TeamPerformance({
  rows,
  loading,
  periodLabel,
  title,
  subtitle,
  showSort = true,
}: {
  rows: TeamRow[];
  loading?: boolean;
  periodLabel: string;
  title?: string;
  subtitle?: string;
  showSort?: boolean;
}) {
  const { t } = useTranslation("projects");
  const [sort, setSort] = useState<SortKey>("utilization");

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const totalLogged = r.billableHours + r.internalHours;
      const utilization = r.capacityHours > 0 ? totalLogged / r.capacityHours : 0;
      const billablePct = totalLogged > 0 ? r.billableHours / totalLogged : 0;
      return { ...r, totalLogged, utilization, billablePct };
    });
  }, [rows]);

  const sorted = useMemo(() => {
    const copy = [...enriched];
    if (sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "utilization") copy.sort((a, b) => b.utilization - a.utilization);
    if (sort === "billable") copy.sort((a, b) => b.billablePct - a.billablePct);
    return copy;
  }, [enriched, sort]);

  const resolvedTitle = title ?? t("team.title");
  const resolvedSubtitle = subtitle ?? t("team.subtitle", { period: periodLabel });

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-muted/40 to-transparent px-5 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {resolvedTitle}
          </h2>
          <p className="text-[11px] text-muted-foreground">{resolvedSubtitle}</p>
        </div>
        {showSort && (
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-1">
            {(
              [
                { k: "utilization", l: t("team.sortByUtilization") },
                { k: "billable", l: t("team.sortByBillable") },
                { k: "name", l: t("team.sortByName") },
              ] as { k: SortKey; l: string }[]
            ).map((s) => (
              <button
                key={s.k}
                onClick={() => setSort(s.k)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium",
                  sort === s.k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.l}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left font-medium">{t("team.columns.member")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("team.columns.capacity")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("team.columns.logged")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("team.columns.utilization")}</th>
              <th className="px-5 py-2 text-left font-medium">{t("team.columns.split")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  {t("common:loading", { defaultValue: "Loading…" })}
                </td>
              </tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  {t("team.noTimeLogged")}
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <tr key={r.resourceId} className="hover:bg-accent/30">
                <td className="px-5 py-2.5 text-sm text-foreground">
                  <div className="flex items-center gap-2.5">
                    <CollaboratorAvatar
                      collaboratorId={r.collaboratorId ?? undefined}
                      fotoPath={r.fotoPath ?? undefined}
                      name={r.name}
                      color={r.color ?? undefined}
                      size={26}
                    />
                    <span className="truncate">{r.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                  {Math.round(r.capacityHours)}h
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-foreground">
                  {Math.round(r.totalLogged)}h
                </td>
                <td className="px-3 py-2.5 text-center">
                  <UtilizationPill pct={r.utilization} />
                </td>
                <td className="px-5 py-2.5">
                  <SplitBar
                    billable={r.billableHours}
                    internal={r.internalHours}
                    nonWorking={r.nonWorkingHours}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UtilizationPill({ pct }: { pct: number }) {
  const display = Math.round(pct * 100);
  const tone =
    pct > 1
      ? "bg-destructive text-destructive-foreground"
      : pct >= 0.75
        ? "bg-emerald-500 text-white"
        : pct >= 0.5
          ? "bg-amber-500 text-white"
          : "bg-muted text-muted-foreground";
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

function SplitBar({
  billable,
  internal,
  nonWorking,
}: {
  billable: number;
  internal: number;
  nonWorking: number;
}) {
  const { t } = useTranslation("projects");
  const total = billable + internal + nonWorking;
  if (total === 0) {
    return <div className="h-2.5 w-full rounded-full bg-muted" />;
  }
  const b = (billable / total) * 100;
  const i = (internal / total) * 100;
  const n = (nonWorking / total) * 100;
  const billablePct = billable + internal > 0 ? Math.round((billable / (billable + internal)) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
        title={t("team.splitTooltip", {
          billable: Math.round(billable),
          internal: Math.round(internal),
          nonWorking: Math.round(nonWorking),
        })}
      >
        {b > 0 && <div className="bg-emerald-500" style={{ width: `${b}%` }} />}
        {i > 0 && <div className="bg-amber-500" style={{ width: `${i}%` }} />}
        {n > 0 && <div className="bg-muted-foreground/30" style={{ width: `${n}%` }} />}
      </div>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {billablePct}%
      </span>
    </div>
  );
}
