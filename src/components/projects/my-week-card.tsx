/**
 * "My week" — the collaborator-facing weekly status strip shown above the
 * existing timesheet grid.
 *
 * Deliberately neutral: recording fewer hours than the contractual capacity is
 * never presented as a deficit. Only working time above capacity raises a
 * workload notice, and even then submission is never blocked.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatHM } from "@/lib/projects/time-format";
import {
  excessHours,
  isWeekLocked,
  useSubmitWeek,
  useTimesheetWeek,
  useWeeklyCapacity,
  type TimesheetWeek,
  type WeekTotals,
} from "@/lib/projects/use-timesheet-weeks";

function statusTone(status: TimesheetWeek["status"] | "open") {
  switch (status) {
    case "submitted":
      return "border-sky-500/30 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200";
    case "returned":
      return "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200";
    case "approved":
      return "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function MyWeekCard({
  userId,
  collaboratorId,
  weekStart,
  weekEnd,
  weekLabel,
  totals,
  viewingOther,
}: {
  userId: string | null;
  collaboratorId: string | null;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  totals: WeekTotals;
  viewingOther: boolean;
}) {
  const { t } = useTranslation(["projects"]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: week } = useTimesheetWeek({ userId, weekStart });
  const { data: capacityInfo } = useWeeklyCapacity(collaboratorId);
  const submit = useSubmitWeek();

  const capacity = capacityInfo?.weeklyCapacity ?? 40;
  const excess = useMemo(() => excessHours(totals, capacity), [totals, capacity]);
  const status = week?.status ?? "open";
  const locked = isWeekLocked(week);

  const statusLabel = t(`timesheetWeek.status.${status}`);

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{t("timesheetWeek.myWeek")}</h2>
            <span className="text-sm text-muted-foreground">{weekLabel}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(status)}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Metric label={t("timesheetWeek.projectHours")} value={totals.project} />
            <Metric label={t("timesheetWeek.internalHours")} value={totals.internal} />
            <Metric label={t("timesheetWeek.leaveHours")} value={totals.leave} />
            <Metric label={t("timesheetWeek.workingHours")} value={totals.working} strong />
            <Metric label={t("timesheetWeek.accountedHours")} value={totals.accounted} />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {t("timesheetWeek.capacityLine", {
              worked: formatHM(totals.working) || "0:00",
              capacity: formatHM(capacity) || "0:00",
            })}
          </p>

          {excess > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {t("timesheetWeek.overCapacityNotice", {
                  excess: formatHM(excess) || "0:00",
                  capacity: formatHM(capacity) || "0:00",
                })}
              </span>
            </div>
          )}

          {status === "returned" && week?.reviewer_comment && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <RotateCcw className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {t("timesheetWeek.returnedNotice")} — {week.reviewer_comment}
              </span>
            </div>
          )}

          {status === "approved" && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {t("timesheetWeek.approvedNotice")}
                {week && week.additional_hours_approved > 0
                  ? ` · ${t("timesheetWeek.additionalBanked", {
                      hours: formatHM(week.additional_hours_approved) || "0:00",
                    })}`
                  : ""}
              </span>
            </div>
          )}

          {status === "submitted" && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {t("timesheetWeek.submittedNotice")}
            </p>
          )}
        </div>

        {!viewingOther && (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={locked || !userId || submit.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Send className="h-3.5 w-3.5" />
            {t("timesheetWeek.submitWeek")}
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("timesheetWeek.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("timesheetWeek.confirmBody", { week: weekLabel })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <SummaryLine label={t("timesheetWeek.projectHours")} value={totals.project} />
            <SummaryLine label={t("timesheetWeek.internalHours")} value={totals.internal} />
            <SummaryLine label={t("timesheetWeek.leaveHours")} value={totals.leave} />
            <SummaryLine label={t("timesheetWeek.workingHours")} value={totals.working} strong />
          </div>
          {excess > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("timesheetWeek.confirmOverCapacity", {
                excess: formatHM(excess) || "0:00",
              })}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("timesheetWeek.cancel")}
            </Button>
            <Button
              disabled={submit.isPending || !userId}
              onClick={() => {
                if (!userId) return;
                submit.mutate(
                  {
                    userId,
                    collaboratorId,
                    weekStart,
                    weekEnd,
                    capacity,
                    totals,
                  },
                  {
                    onSuccess: () => {
                      setConfirmOpen(false);
                      toast.success(t("timesheetWeek.submittedToast"));
                    },
                    onError: (e: unknown) =>
                      toast.error((e as Error)?.message ?? t("timesheetWeek.submitFailed")),
                  },
                );
              }}
            >
              {t("timesheetWeek.confirmSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={strong ? "font-semibold" : ""}>{formatHM(value) || "0:00"}</div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{formatHM(value) || "0:00"}</span>
    </div>
  );
}
