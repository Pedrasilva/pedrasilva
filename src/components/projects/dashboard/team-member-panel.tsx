import i18n from "@/i18n/index";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { TeamRow } from "./team-performance";
import {
  breakdownLogged,
  daysWithoutHours,
  hoursPerWeek,
  type CapacityBreakdown,
  type DrillEntry,
} from "@/lib/projects/team-drilldown";

const fmtH = (h: number) => `${Math.round(h * 10) / 10}h`;
const fmtD = (d: string) => format(parseISO(d), "dd/MM");
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Hours-only drill-down for one team member — never shows costs or rates. */
export function TeamMemberPanel({
  open,
  onOpenChange,
  detail,
  periodStart,
  cutoff,
  periodLabel,
  canOpenTimesheet,
  isSelf,
  onOpenProject,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: { row: TeamRow; entries: DrillEntry[]; capacity: CapacityBreakdown } | null;
  periodStart: string;
  cutoff: string;
  periodLabel: string;
  canOpenTimesheet: boolean;
  isSelf: boolean;
  onOpenProject: (projectId: string) => void;
}) {
  const { t } = useTranslation("projects");
  const data = useMemo(() => {
    if (!detail) return null;
    const bd = breakdownLogged(detail.entries, {
      noStage: t("team.drill.noStage"),
      uncategorised: t("team.drill.uncategorised"),
      unknownProject: t("team.drill.unknownProject"),
    });
    return {
      bd,
      weeks: hoursPerWeek(detail.entries, periodStart, cutoff),
      missing: daysWithoutHours(detail.capacity.workingDays, detail.entries),
    };
  }, [detail, periodStart, cutoff, t]);

  const cap = detail?.capacity;
  const maxWeek = Math.max(1, ...(data?.weeks.map((w) => w.hours) ?? [1]));
  const utilization = cap && cap.net > 0 && data ? data.bd.total / cap.net : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {detail && cap && data && (
          <>
            <SheetHeader>
              <SheetTitle>{detail.row.name}</SheetTitle>
              <SheetDescription>
                {t("team.drill.range", { period: periodLabel, from: fmtD(periodStart), to: fmtD(cutoff) })}
              </SheetDescription>
            </SheetHeader>

            <section className="mt-5 space-y-1.5 text-xs">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("team.drill.capacity")}
              </h3>
              <Line label={t("team.drill.gross", { days: cap.weekdays, hours: cap.dailyHours })} value={fmtH(cap.gross)} />
              <Deduction title={t("team.drill.holidays")} items={cap.holidays.map((h) => ({ date: h.date, label: h.name, hours: h.hours }))} />
              <Deduction title={t("team.drill.closures")} items={cap.closures.map((h) => ({ date: h.date, label: h.name, hours: h.hours }))} />
              <Deduction title={t("team.drill.leave")} items={cap.leave.map((h) => ({ date: h.date, label: h.type, hours: h.hours }))} />
              <div className="border-t border-border pt-1.5">
                <Line label={t("team.drill.net")} value={fmtH(cap.net)} strong />
                <Line label={t("team.drill.logged")} value={fmtH(data.bd.total)} />
                <Line label={t("team.columns.utilization")} value={pct(utilization)} />
              </div>
            </section>

            <section className="mt-5 text-xs">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("team.drill.byProject")}
              </h3>
              {data.bd.lines.length === 0 && <p className="text-muted-foreground">{t("team.noTimeLogged")}</p>}
              <ul className="space-y-2">
                {data.bd.lines.map((l) => (
                  <li key={l.key}>
                    <div className="flex items-center gap-2">
                      {l.projectId ? (
                        <button
                          className="min-w-0 flex-1 truncate text-left font-medium text-primary hover:underline"
                          onClick={() => onOpenProject(l.projectId!)}
                          title={l.label}
                        >
                          {l.label}
                        </button>
                      ) : (
                        <span className="min-w-0 flex-1 truncate font-medium" title={l.label}>{l.label}</span>
                      )}
                      <Tag billable={l.billable} />
                      <span className="w-12 text-right font-mono tabular-nums">{fmtH(l.hours)}</span>
                      <span className="w-9 text-right font-mono text-muted-foreground tabular-nums">{pct(l.pct)}</span>
                    </div>
                    {l.stages.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-3">
                        {l.stages.map((s) => (
                          <li key={s.key} className="flex items-center gap-2 text-muted-foreground">
                            <span className="min-w-0 flex-1 truncate" title={s.label}>{s.label}</span>
                            <span className="w-12 text-right font-mono tabular-nums">{fmtH(s.hours)}</span>
                            <span className="w-9 text-right font-mono tabular-nums">{pct(s.pct)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-5 text-xs">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("team.drill.perWeek")}
              </h3>
              <ul className="space-y-1">
                {data.weeks.map((w) => (
                  <li key={w.weekStart} className="flex items-center gap-2">
                    <span className="w-12 font-mono text-muted-foreground">{fmtD(w.weekStart)}</span>
                    <div className="h-2 flex-1 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${(w.hours / maxWeek) * 100}%` }} />
                    </div>
                    <span className="w-12 text-right font-mono tabular-nums">{fmtH(w.hours)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-5 text-xs">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("team.drill.missingDays", { count: data.missing.length })}
              </h3>
              {data.missing.length === 0 ? (
                <p className="text-muted-foreground">{t("team.drill.noMissing")}</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {data.missing.map((d) => (
                    <span key={d} className="rounded border border-border px-1.5 py-0.5 font-mono">{fmtD(d)}</span>
                  ))}
                </div>
              )}
            </section>

            {canOpenTimesheet && (
              <Link
                to="/projects/timesheet"
                search={isSelf || !detail.row.collaboratorId ? { week: periodStart } : { week: periodStart, person: detail.row.collaboratorId }}
                className="mt-6 inline-flex rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                {t("team.drill.openTimesheet")}
              </Link>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  useTranslation();
  return (
    <div className={cn("flex justify-between gap-2", strong && "font-semibold")}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function Deduction({ title, items }: { title: string; items: { date: string; label: string; hours: number }[] }) {
  useTranslation();
  const total = items.reduce((s, i) => s + i.hours, 0);
  return (
    <div>
      <Line label={i18n.t("projects:teamMemberPanel.ui.negativeValue", { value1: title })} value={fmtH(total)} />
      {items.map((i) => (
        <div key={i.date + i.label} className="flex justify-between gap-2 pl-3 text-muted-foreground">
          <span className="truncate">{fmtD(i.date)} · {i.label}</span>
          <span className="font-mono tabular-nums">{fmtH(i.hours)}</span>
        </div>
      ))}
    </div>
  );
}

function Tag({ billable }: { billable: boolean }) {
  const { t } = useTranslation("projects");
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        billable ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {billable ? t("team.drill.billable") : t("team.drill.internal")}
    </span>
  );
}
