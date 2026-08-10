/**
 * Per-stage hours breakdown shown inside an expanded dashboard table row.
 *
 * Shows, for each stage of a project, the hours attributed (planned through
 * allocations), the hours already used (logged time entries) and the
 * remaining balance, plus a small health dot per stage.
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type StageHoursStatus = "ok" | "warn" | "bad" | "none";

export interface StageHoursRow {
  stageId: string;
  name: string;
  plannedHours: number;
  loggedHours: number;
  remainingHours: number;
  status: StageHoursStatus;
}

export function stageHoursStatus(planned: number, logged: number): StageHoursStatus {
  if (planned <= 0) return logged > 0 ? "warn" : "none";
  const ratio = logged / planned;
  if (ratio > 1) return "bad";
  if (ratio >= 0.8) return "warn";
  return "ok";
}

export function StageDot({ status }: { status: StageHoursStatus }) {
  if (status === "none") {
    return <span className="inline-block h-2 w-2 rounded-full border border-border bg-muted/40" />;
  }
  const cls =
    status === "ok" ? "bg-emerald-500" : status === "warn" ? "bg-amber-500" : "bg-destructive";
  return <span className={cn("inline-block h-2 w-2 rounded-full", cls)} />;
}

export function StageHoursBreakdown({ stages }: { stages: StageHoursRow[] }) {
  const { t } = useTranslation("projects");

  if (stages.length === 0) {
    return (
      <p className="px-5 py-3 text-[11px] text-muted-foreground">{t("effort.stages.empty")}</p>
    );
  }

  return (
    <div className="bg-muted/20 px-5 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {t("effort.stages.title")}
      </p>
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-6 py-1" />
            <th className="py-1 text-left font-medium">{t("effort.stages.stage")}</th>
            <th className="py-1 text-right font-medium">{t("effort.columns.planned")}</th>
            <th className="py-1 text-right font-medium">{t("effort.columns.logged")}</th>
            <th className="py-1 text-right font-medium">{t("effort.columns.remaining")}</th>
            <th className="w-32 py-1 text-left font-medium">{t("effort.stages.usage")}</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s) => {
            const pct =
              s.plannedHours > 0 ? Math.min(150, (s.loggedHours / s.plannedHours) * 100) : 0;
            return (
              <tr key={s.stageId} className="border-t border-border/50">
                <td className="py-1.5 text-center">
                  <StageDot status={s.status} />
                </td>
                <td className="max-w-[18rem] truncate py-1.5 pr-3">{s.name}</td>
                <td className="py-1.5 text-right font-mono text-muted-foreground">
                  {s.plannedHours > 0 ? `${Math.round(s.plannedHours)}h` : "—"}
                </td>
                <td className="py-1.5 text-right font-mono">{Math.round(s.loggedHours)}h</td>
                <td
                  className={cn(
                    "py-1.5 text-right font-mono font-semibold",
                    s.remainingHours < 0 ? "text-destructive" : "text-foreground",
                  )}
                >
                  {s.plannedHours > 0 ? `${Math.round(s.remainingHours)}h` : "—"}
                </td>
                <td className="py-1.5 pl-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        s.status === "bad"
                          ? "bg-destructive"
                          : s.status === "warn"
                            ? "bg-amber-500"
                            : "bg-emerald-500",
                      )}
                      style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
