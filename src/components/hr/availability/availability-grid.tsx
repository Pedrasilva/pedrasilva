import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { cn } from "@/lib/utils";
import type {
  AvailabilityPerson,
  Cell,
  Coverage,
  DayColumn,
} from "@/lib/hr/use-team-availability";
import { cellStyle, coverageTone, mix } from "./absence-visuals";
import { formatDayLabel } from "./format-day";

const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function AvailabilityGrid({
  people,
  days,
  cells,
  coverage,
  canSeeDetail,
}: {
  people: AvailabilityPerson[];
  days: DayColumn[];
  cells: Record<string, Record<string, Cell>>;
  coverage: Coverage[];
  canSeeDetail: boolean;
}) {
  const { t } = useTranslation("hr");
  const coverageByIso = new Map(coverage.map((c) => [c.iso, c]));

  const cellLabel = (cell: Cell | undefined, day: DayColumn) => {
    if (day.holidayName) return day.holidayName;
    if (!cell) return "";
    switch (cell.kind) {
      case "remote":
        return t("availability.state.remote");
      case "weekend":
        return t("availability.legend.weekend");
      case "pending":
      case "absent":
      case "absent-half": {
        const base = canSeeDetail
          ? t(`availability.types.${cell.tipo}`)
          : cell.tipo === "ferias"
            ? t("availability.state.holiday")
            : t("availability.state.unavailable");
        const half =
          cell.kind === "absent-half"
            ? ` · ${t(`availability.period.${cell.periodo === "tarde" ? "afternoon" : "morning"}`)}`
            : "";
        const pending = cell.kind === "pending" ? ` · ${t("availability.state.pending")}` : "";
        return `${base}${half}${pending}`;
      }
      default:
        return t("availability.state.available");
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 min-w-[180px] border-b bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("availability.grid.person")}
            </th>
            {days.map((d) => (
              <th
                key={d.iso}
                className={cn(
                  "w-8 border-b border-l px-0 py-1 text-center align-bottom",
                  d.isToday && "border-x-2 border-x-[var(--hr-accent)]",
                )}
                style={{
                  background: d.isWeekend
                    ? mix("var(--ink)", 6)
                    : d.holidayName
                      ? mix("var(--ink)", 10)
                      : undefined,
                }}
                title={d.holidayName ?? undefined}
              >
                <div className="text-[9px] uppercase text-muted-foreground">
                  {t(`availability.weekday.${WD[d.weekday]}`)}
                </div>
                <div
                  className={cn(
                    "text-[11px] tabular-nums",
                    d.isToday ? "font-bold text-[var(--hr-accent)]" : "text-foreground",
                  )}
                >
                  {String(d.dayOfMonth).padStart(2, "0")}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="group">
              <th className="sticky left-0 z-10 border-b bg-card px-3 py-1 text-left font-normal group-hover:bg-muted/40">
                <span className="flex items-center gap-2">
                  <CollaboratorAvatar
                    collaboratorId={p.id}
                    fotoPath={p.foto_path}
                    name={p.nome}
                    size={22}
                  />
                  <span className="truncate text-[13px]">{p.nome}</span>
                </span>
              </th>
              {days.map((d) => {
                const cell = cells[p.id]?.[d.iso];
                return (
                  <Tooltip key={d.iso}>
                    <TooltipTrigger asChild>
                      <td
                        className={cn(
                          "h-7 border-b border-l p-0",
                          d.isToday && "border-x-2 border-x-[var(--hr-accent)]",
                        )}
                        style={cellStyle(cell)}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <span className="text-xs">
                        {p.nome} · {formatDayLabel(d.iso)} — {cellLabel(cell, d)}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </tr>
          ))}

          {/* Daily coverage */}
          <tr>
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("availability.grid.coverage")}
            </th>
            {days.map((d) => {
              const c = coverageByIso.get(d.iso);
              const show = d.isWorkingDay && c;
              return (
                <Tooltip key={d.iso}>
                  <TooltipTrigger asChild>
                    <td
                      className="border-l p-0 align-bottom"
                      style={{ background: d.isWorkingDay ? undefined : mix("var(--ink)", 6) }}
                    >
                      <div className="flex h-12 flex-col items-center justify-end gap-[2px] px-[3px] pb-1">
                        {show ? (
                          <>
                            <div
                              className="flex w-full items-end rounded-sm"
                              style={{ height: "28px", background: mix("var(--ink)", 7) }}
                            >
                              <div
                                className="w-full rounded-sm"
                                style={{
                                  height: `${Math.max(3, (c.pct / 100) * 28)}px`,
                                  background: coverageTone(c.pct),
                                  opacity: 0.8,
                                }}
                              />
                            </div>
                            <span
                              className="text-[8px] tabular-nums leading-none"
                              style={{ color: c.pct >= 100 ? "var(--muted-foreground)" : coverageTone(c.pct) }}
                            >
                              {Math.round(c.pct)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {show ? (
                      <span className="text-xs">
                        {t("availability.grid.coverageTip", {
                          available: c.available,
                          total: c.total,
                          pct: Math.round(c.pct),
                          capacity: Math.round(c.capacityPct),
                        })}
                      </span>
                    ) : (
                      <span className="text-xs">{t("availability.grid.nonWorkingDay")}</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
