/**
 * Projects → Timesheets → Weekly Approval.
 *
 * The whole weekly review is meant to be doable from this one screen: who is
 * missing, who is waiting, who worked above their own contractual capacity.
 * It is intentionally separate from `/projects/approvals`, which reviews
 * individual entries for project/billing purposes and is left untouched.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/projects/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { useDateLocale } from "@/i18n/use-date-locale";
import { formatHM } from "@/lib/projects/time-format";
import {
  useApproveWeek,
  useReopenWeek,
  useReturnWeek,
  useWeekBreakdown,
  useWeeklyApprovalOverview,
  type WeeklyApprovalRow,
} from "@/lib/projects/use-timesheet-weeks";

export const Route = createFileRoute("/_app/projects/weekly-approval")({
  component: WeeklyApprovalPage,
});

type FilterKey =
  | "all"
  | "awaiting"
  | "not_submitted"
  | "approved"
  | "returned"
  | "over_capacity";

function WeeklyApprovalPage() {
  const { t } = useTranslation(["projects", "common"]);
  const locale = useDateLocale();
  const { user, isAdmin } = useAuth();
  const { can, loading: permsLoading } = useMyPermissionsV2();
  const canApprove = isAdmin || can("timesheets.approve", "team");

  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const weekStartDate = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn: 1 }),
    [weekAnchor],
  );
  const weekStart = format(weekStartDate, "yyyy-MM-dd");
  const weekEnd = format(addDays(weekStartDate, 6), "yyyy-MM-dd");
  const weekLabel = `${format(weekStartDate, "d MMM", { locale })} – ${format(
    addDays(weekStartDate, 6),
    "d MMM yyyy",
    { locale },
  )}`;

  const { data: rows = [], isLoading } = useWeeklyApprovalOverview(weekStart, weekEnd);

  const stats = useMemo(() => {
    let submitted = 0;
    let approved = 0;
    let awaiting = 0;
    let notSubmitted = 0;
    let returned = 0;
    let overCapacity = 0;
    let additional = 0;
    for (const r of rows) {
      if (r.status === "approved") {
        approved += 1;
        submitted += 1;
      } else if (r.status === "submitted") {
        submitted += 1;
        awaiting += 1;
      } else if (r.status === "returned") returned += 1;
      else notSubmitted += 1;
      if (r.excess > 0) overCapacity += 1;
      additional += r.week?.additional_hours_approved ?? 0;
    }
    return {
      total: rows.length,
      submitted,
      approved,
      awaiting,
      notSubmitted,
      returned,
      overCapacity,
      additional,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "awaiting":
        return rows.filter((r) => r.status === "submitted");
      case "not_submitted":
        return rows.filter((r) => r.status === "not_submitted" || r.status === "open");
      case "approved":
        return rows.filter((r) => r.status === "approved");
      case "returned":
        return rows.filter((r) => r.status === "returned");
      case "over_capacity":
        return rows.filter((r) => r.excess > 0);
      default:
        return rows;
    }
  }, [rows, filter]);

  const selectedRow = rows.find((r) => r.userId === selected) ?? null;

  if (permsLoading) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">
          {t("common:loading", { defaultValue: "Loading…" })}
        </div>
      </AppShell>
    );
  }

  if (!canApprove) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">
          {t("common:accessDenied", { defaultValue: "Access denied." })}
        </div>
      </AppShell>
    );
  }

  const filters: Array<{ key: FilterKey; label: string; count?: number }> = [
    { key: "all", label: t("weeklyApproval.filters.all"), count: stats.total },
    { key: "awaiting", label: t("weeklyApproval.filters.awaiting"), count: stats.awaiting },
    {
      key: "not_submitted",
      label: t("weeklyApproval.filters.notSubmitted"),
      count: stats.notSubmitted,
    },
    { key: "approved", label: t("weeklyApproval.filters.approved"), count: stats.approved },
    { key: "returned", label: t("weeklyApproval.filters.returned"), count: stats.returned },
    {
      key: "over_capacity",
      label: t("weeklyApproval.filters.overCapacity"),
      count: stats.overCapacity,
    },
  ];

  return (
    <AppShell>
      <div className="w-full px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("weeklyApproval.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("weeklyApproval.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setWeekAnchor((d) => addWeeks(d, -1))}
              aria-label={t("weeklyApproval.previousWeek")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setWeekAnchor(new Date())}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {weekLabel}
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setWeekAnchor((d) => addWeeks(d, 1))}
              aria-label={t("weeklyApproval.nextWeek")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Overview */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t("weeklyApproval.stats.completion")}
            value={`${stats.submitted} / ${stats.total}`}
            hint={t("weeklyApproval.stats.completionHint")}
          />
          <StatCard
            label={t("weeklyApproval.stats.approval")}
            value={`${stats.approved} / ${stats.submitted}`}
            hint={t("weeklyApproval.stats.approvalHint")}
          />
          <StatCard
            label={t("weeklyApproval.stats.exceptions")}
            value={String(stats.overCapacity)}
            hint={t("weeklyApproval.stats.exceptionsHint")}
            tone={stats.overCapacity > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label={t("weeklyApproval.stats.additional")}
            value={formatHM(stats.additional) || "0:00"}
            hint={t("weeklyApproval.stats.additionalHint")}
          />
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                filter === f.key
                  ? "border-foreground/30 bg-foreground/5 font-medium"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
              {typeof f.count === "number" ? ` · ${f.count}` : ""}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_minmax(0,1.2fr)] gap-2 border-b border-border bg-muted/30 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
            <div>{t("weeklyApproval.columns.collaborator")}</div>
            <div className="text-right">{t("weeklyApproval.columns.project")}</div>
            <div className="text-right">{t("weeklyApproval.columns.internal")}</div>
            <div className="text-right">{t("weeklyApproval.columns.leave")}</div>
            <div className="text-right">{t("weeklyApproval.columns.working")}</div>
            <div className="text-right">{t("weeklyApproval.columns.capacity")}</div>
            <div className="text-right">{t("weeklyApproval.columns.status")}</div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common:loading", { defaultValue: "Loading…" })}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("weeklyApproval.empty")}
            </div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.userId}
                onClick={() => setSelected(r.userId)}
                className="grid w-full grid-cols-2 gap-2 border-b border-border px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/40 md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_minmax(0,1.2fr)]"
              >
                <div className="col-span-2 min-w-0 truncate font-medium md:col-span-1">
                  {r.name}
                </div>
                <Cell label={t("weeklyApproval.columns.project")} value={r.totals.project} />
                <Cell label={t("weeklyApproval.columns.internal")} value={r.totals.internal} />
                <Cell label={t("weeklyApproval.columns.leave")} value={r.totals.leave} />
                <Cell
                  label={t("weeklyApproval.columns.working")}
                  value={r.totals.working}
                  strong
                />
                <div className="text-right text-xs text-muted-foreground md:text-sm">
                  <span className="md:hidden">{t("weeklyApproval.columns.capacity")}: </span>
                  {formatHM(r.capacity) || "0:00"}
                  {r.excess > 0 && (
                    <span className="ml-1 text-amber-700 dark:text-amber-300">
                      +{formatHM(r.excess)}
                    </span>
                  )}
                </div>
                <div className="col-span-2 flex justify-start md:col-span-1 md:justify-end">
                  <StatusPill status={r.status} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <ReviewPanel
        row={selectedRow}
        weekStart={weekStart}
        weekEnd={weekEnd}
        weekLabel={weekLabel}
        approverId={user?.id ?? null}
        onClose={() => setSelected(null)}
      />
    </AppShell>
  );
}

function Cell({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`text-right text-xs md:text-sm ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground md:hidden">{label}: </span>
      {formatHM(value) || "—"}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "warning"
          ? "border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20"
          : "border-border bg-card"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function StatusPill({ status }: { status: WeeklyApprovalRow["status"] }) {
  const { t } = useTranslation(["projects"]);
  const tone =
    status === "approved"
      ? "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
      : status === "submitted"
        ? "border-sky-500/30 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200"
        : status === "returned"
          ? "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          : "border-border bg-muted/40 text-muted-foreground";
  const key = status === "not_submitted" || status === "open" ? "notSubmitted" : status;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {t(`weeklyApproval.status.${key}`)}
    </span>
  );
}

function ReviewPanel({
  row,
  weekStart,
  weekEnd,
  weekLabel,
  approverId,
  onClose,
}: {
  row: WeeklyApprovalRow | null;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  approverId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(["projects", "common"]);
  const [comment, setComment] = useState("");
  const [acknowledge, setAcknowledge] = useState(true);
  const [additional, setAdditional] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [showDaily, setShowDaily] = useState(false);

  const approve = useApproveWeek();
  const returnWeek = useReturnWeek();
  const reopen = useReopenWeek();

  const { data: breakdown } = useWeekBreakdown({
    userId: row?.userId ?? null,
    weekStart,
    weekEnd,
    enabled: !!row,
  });

  const excess = row?.excess ?? 0;
  const proposed = additional === "" ? excess : Math.max(0, Number(additional) || 0);
  const capped = Math.min(proposed, excess);
  const reduced = excess > 0 && acknowledge && capped < excess;

  const week = row?.week ?? null;
  const canAct = !!week && !!approverId;

  const reset = () => {
    setComment("");
    setAdditional("");
    setAcknowledge(true);
    setReopenReason("");
    setShowDaily(false);
  };

  return (
    <Sheet
      open={!!row}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.name}</SheetTitle>
              <p className="text-sm text-muted-foreground">{weekLabel}</p>
            </SheetHeader>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Summary label={t("weeklyApproval.columns.project")} value={row.totals.project} />
              <Summary label={t("weeklyApproval.columns.internal")} value={row.totals.internal} />
              <Summary label={t("weeklyApproval.columns.leave")} value={row.totals.leave} />
              <Summary
                label={t("weeklyApproval.columns.working")}
                value={row.totals.working}
                strong
              />
              <Summary label={t("weeklyApproval.columns.capacity")} value={row.capacity} />
              <Summary label={t("weeklyApproval.review.accounted")} value={row.totals.accounted} />
            </div>

            {excess > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {t("weeklyApproval.review.excessNotice", {
                    working: formatHM(row.totals.working) || "0:00",
                    capacity: formatHM(row.capacity) || "0:00",
                    excess: formatHM(excess) || "0:00",
                  })}
                </span>
              </div>
            )}

            {/* Breakdown */}
            <div className="mt-5">
              <h3 className="text-sm font-semibold">{t("weeklyApproval.review.breakdown")}</h3>
              <div className="mt-2 rounded-md border border-border">
                {(breakdown?.rows ?? []).length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {t("weeklyApproval.review.noEntries")}
                  </div>
                ) : (
                  (breakdown?.rows ?? []).map((b) => (
                    <div
                      key={b.key}
                      className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-0"
                    >
                      <span className="min-w-0 truncate">{b.label}</span>
                      <span className="ml-3 tabular-nums">{formatHM(b.hours)}</span>
                    </div>
                  ))
                )}
              </div>
              <button
                className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShowDaily((v) => !v)}
              >
                {showDaily
                  ? t("weeklyApproval.review.hideDaily")
                  : t("weeklyApproval.review.showDaily")}
              </button>
              {showDaily && (
                <div className="mt-2 rounded-md border border-border">
                  {(breakdown?.daily ?? []).map((d, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-3 border-b border-border px-3 py-1.5 text-xs last:border-0"
                    >
                      <span className="w-20 flex-shrink-0 text-muted-foreground">{d.date}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {d.label}
                        {d.notes ? ` — ${d.notes}` : ""}
                      </span>
                      <span className="tabular-nums">{formatHM(d.hours)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            {!week ? (
              <p className="mt-6 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t("weeklyApproval.review.notSubmittedYet")}
              </p>
            ) : week.status === "approved" ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {t("weeklyApproval.review.closed")}
                    {week.additional_hours_approved > 0
                      ? ` · ${t("weeklyApproval.review.bankedHours", {
                          hours: formatHM(week.additional_hours_approved) || "0:00",
                        })}`
                      : ""}
                  </span>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {t("weeklyApproval.review.reopenReason")}
                  </label>
                  <Textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={!canAct || reopen.isPending}
                  onClick={() =>
                    reopen.mutate(
                      { weekId: week.id, approverId: approverId!, reason: reopenReason },
                      {
                        onSuccess: () => {
                          toast.success(t("weeklyApproval.review.reopenedToast"));
                          reset();
                          onClose();
                        },
                        onError: (e: unknown) => toast.error((e as Error)?.message ?? "Error"),
                      },
                    )
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("weeklyApproval.review.reopen")}
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {excess > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <h4 className="text-sm font-semibold">
                      {t("weeklyApproval.review.additionalTitle")}
                    </h4>
                    <div className="mt-2 flex items-start gap-2">
                      <Checkbox
                        id="ack"
                        checked={acknowledge}
                        onCheckedChange={(v) => setAcknowledge(v === true)}
                      />
                      <label htmlFor="ack" className="text-sm leading-snug">
                        {t("weeklyApproval.review.acknowledge", {
                          hours: formatHM(excess) || "0:00",
                        })}
                      </label>
                    </div>
                    {acknowledge && (
                      <div className="mt-3 flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">
                          {t("weeklyApproval.review.hoursToBank")}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={excess}
                          step="0.25"
                          value={additional === "" ? String(excess) : additional}
                          onChange={(e) => setAdditional(e.target.value)}
                          className="h-8 w-24"
                        />
                        <span className="text-xs text-muted-foreground">
                          {t("weeklyApproval.review.maxHours", { hours: excess })}
                        </span>
                      </div>
                    )}
                    {reduced && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        {t("weeklyApproval.review.reasonRequired")}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground">
                    {t("weeklyApproval.review.comment")}
                  </label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      !canAct ||
                      approve.isPending ||
                      (reduced && comment.trim().length === 0)
                    }
                    onClick={() =>
                      approve.mutate(
                        {
                          weekId: week.id,
                          approverId: approverId!,
                          collaboratorId: row.collaboratorId,
                          weekStart,
                          additionalHours: excess > 0 && acknowledge ? capped : 0,
                          calculatedExcess: excess,
                          note: comment.trim() || null,
                          comment: comment.trim() || null,
                        },
                        {
                          onSuccess: () => {
                            toast.success(t("weeklyApproval.review.approvedToast"));
                            reset();
                            onClose();
                          },
                          onError: (e: unknown) => toast.error((e as Error)?.message ?? "Error"),
                        },
                      )
                    }
                  >
                    {t("weeklyApproval.review.approve")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canAct || returnWeek.isPending || comment.trim().length === 0}
                    onClick={() =>
                      returnWeek.mutate(
                        { weekId: week.id, approverId: approverId!, comment: comment.trim() },
                        {
                          onSuccess: () => {
                            toast.success(t("weeklyApproval.review.returnedToast"));
                            reset();
                            onClose();
                          },
                          onError: (e: unknown) => toast.error((e as Error)?.message ?? "Error"),
                        },
                      )
                    }
                  >
                    {t("weeklyApproval.review.return")}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("weeklyApproval.review.returnHint")}
                </p>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Summary({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm ${strong ? "font-semibold" : ""}`}>{formatHM(value) || "0:00"}</div>
    </div>
  );
}
