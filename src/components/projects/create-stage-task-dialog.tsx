/**
 * Add / edit a task inside a stage.
 *
 * A task is an allocation inside the stage envelope: name, assignee, schedule
 * and effort. The dialog always shows the parent stage context (hours for
 * everyone, sale value / target cost / projected margin for management) and
 * recalculates the impact live while the form is edited.
 *
 * Edit mode passes the allocation being edited to the envelope calculator so
 * its current hours and cost are excluded from "before" — an edit therefore
 * only ever moves the delta.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, Clock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResources } from "@/lib/projects/use-planner";
import {
  useAllocationTasks,
  useCreateStageTask,
  useUpdateStageTask,
  type StageTaskStatus,
} from "@/lib/projects/use-stage-tasks";
import {
  computeStageEnvelope,
  resolveTargetMargin,
  useStageTargetMargins,
  type EnvelopeAllocation,
} from "@/lib/projects/use-stage-envelope";
import { useDefaultResourceRates, effectiveCostRate } from "@/lib/projects/use-default-rates";
import { useTeamPricingAverages } from "@/lib/quotes/use-team-pricing-averages";
import { useHasPermission } from "@/hooks/use-permissions";
import { euros } from "@/lib/projects/gantt-utils";

const STATUS_OPTIONS: { value: StageTaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
];

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(startIso: string, endIso: string) {
  const a = new Date(`${startIso}T00:00:00`).getTime();
  const b = new Date(`${endIso}T00:00:00`).getTime();
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** Mon–Fri days inside the span (public holidays are handled in timesheets). */
function countWeekdays(startIso: string, endIso: string) {
  const total = diffDays(startIso, endIso);
  if (!Number.isFinite(total) || total <= 0) return 0;
  let n = 0;
  const d = new Date(`${startIso}T00:00:00`);
  for (let i = 0; i < total; i++) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function h(n: number) {
  return `${(Math.round(n * 10) / 10).toFixed(1)} h`;
}

function pct(n: number | null) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export interface StageTaskDialogStage {
  id: string;
  name?: string;
  budget?: number | string | null;
  baseline_target_hours?: number | null;
  start_date: string;
  end_date: string;
  allocations: EnvelopeAllocation[];
}

export function CreateStageTaskDialog({
  open,
  onOpenChange,
  stageId,
  projectId,
  stageName,
  stageStart,
  stageEnd,
  stage,
  /** Present → edit mode. The allocation row backing the task. */
  allocationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stageId: string;
  projectId: string;
  stageName?: string;
  stageStart: string;
  stageEnd: string;
  stage?: StageTaskDialogStage;
  allocationId?: string;
}) {
  const { data: resources } = useResources();
  const createTask = useCreateStageTask();
  const updateTask = useUpdateStageTask();
  const { data: defaultRates } = useDefaultResourceRates();
  const { data: teamAvg } = useTeamPricingAverages();
  const { data: margins } = useStageTargetMargins(projectId);
  const { allowed: canSeeFinancials } = useHasPermission("projects.financials");

  const isEdit = !!allocationId;
  const editing = useMemo(
    () => stage?.allocations.find((a) => a.id === allocationId),
    [stage, allocationId],
  );
  const { data: taskRows } = useAllocationTasks(allocationId ? [allocationId] : []);
  const existingTask = allocationId ? taskRows?.[allocationId] : undefined;

  const [name, setName] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [status, setStatus] = useState<StageTaskStatus>("pending");
  const [startDate, setStartDate] = useState(stageStart);
  const [days, setDays] = useState(1);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (isEdit && editing) {
      setResourceId(editing.resource.id);
      setStartDate(editing.start_date);
      setDays(Math.max(1, diffDays(editing.start_date, editing.end_date)));
      setHoursPerDay(Number(editing.hours_per_day) || 8);
    } else {
      setResourceId("");
      setStartDate(stageStart);
      setDays(1);
      setHoursPerDay(8);
      setName("");
      setNotes("");
      setStatus("pending");
    }
  }, [open, isEdit, editing, stageStart]);

  // Task name / notes / status arrive with the task row (edit mode).
  useEffect(() => {
    if (!open || !isEdit || !existingTask) return;
    setName(existingTask.name ?? "");
    setNotes(existingTask.notes ?? "");
    setStatus(existingTask.status ?? "pending");
  }, [open, isEdit, existingTask]);

  const active = (resources ?? []).filter((r) => r.active !== false);
  const endDate = addDays(startDate, Math.max(1, days) - 1);
  const assignee = active.find((r) => r.id === resourceId);

  const workdays = useMemo(() => countWeekdays(startDate, endDate), [startDate, endDate]);
  const draftHours = workdays * (hoursPerDay || 0);
  const totalCalendarHours = Math.max(1, days) * (hoursPerDay || 0);
  const outsideStage = startDate < stageStart || endDate > stageEnd;

  const draftCostRate = assignee
    ? effectiveCostRate(
        (assignee as { cost_rate?: number | null }).cost_rate,
        assignee.id,
        defaultRates,
        (assignee as { hourly_rate_is_override?: boolean | null }).hourly_rate_is_override == null
          ? undefined
          : !!(assignee as { hourly_rate_is_override?: boolean | null }).hourly_rate_is_override,
      )
    : 0;

  const targetMargin = resolveTargetMargin(margins, stageId);
  const envelope = useMemo(
    () =>
      computeStageEnvelope({
        saleValue: Number(stage?.budget ?? 0),
        baselineTargetHours: stage?.baseline_target_hours ?? null,
        avgSaleRate: teamAvg?.avgSalePerHour ?? 0,
        allocations: stage?.allocations ?? [],
        defaultRates,
        targetMargin,
        excludeAllocationId: allocationId ?? null,
        draft: { hours: draftHours, costRate: draftCostRate },
      }),
    [stage, teamAvg, defaultRates, targetMargin, allocationId, draftHours, draftCostRate],
  );

  const marginBelowTarget =
    envelope.after.projectedMargin != null && envelope.after.projectedMargin < targetMargin;

  const submit = async () => {
    if (!name.trim()) return toast.error("Task name is required");
    if (!resourceId) return toast.error("Choose who the task is for");
    try {
      if (isEdit && allocationId) {
        await updateTask.mutateAsync({
          projectId,
          allocation_id: allocationId,
          resource_id: resourceId,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          hours_per_day: hoursPerDay,
          status,
          notes: notes.trim() || null,
        });
        toast.success("Task updated");
      } else {
        await createTask.mutateAsync({
          projectId,
          stage_id: stageId,
          resource_id: resourceId,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          hours_per_day: hoursPerDay,
          status,
          notes: notes.trim() || null,
        });
        toast.success("Task created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const pending = createTask.isPending || updateTask.isPending;
  const hasEnvelope = !!stage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "Add task"}</DialogTitle>
          <DialogDescription>
            {stageName ? `Stage: ${stageName}` : "Add a task to this stage"}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Stage window: {formatDate(stageStart)} → {formatDate(stageEnd)}
            </span>
            <span className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {assignee ? assignee.name : "No assignee yet"}
              {assignee?.role ? ` · ${assignee.role}` : ""}
            </span>
          </div>
        </div>

        {hasEnvelope && (
          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-xs font-medium">Stage hours</div>
            <div className="grid grid-cols-3 divide-x text-center text-xs">
              <Cell label="Capacity" value={h(envelope.capacityHours)} />
              <Cell
                label="Allocated (after)"
                value={h(envelope.after.allocatedHours)}
                sub={`before ${h(envelope.before.allocatedHours)}`}
              />
              <Cell
                label="Remaining"
                value={h(envelope.after.remainingHours)}
                tone={envelope.after.remainingHours < 0 ? "danger" : undefined}
              />
            </div>

            {canSeeFinancials && (
              <>
                <div className="border-y px-3 py-2 text-xs font-medium">
                  Stage financials · target margin {pct(targetMargin)}
                </div>
                <div className="grid grid-cols-2 divide-x text-center text-xs sm:grid-cols-4">
                  <Cell label="Sale value" value={euros(envelope.saleValue)} />
                  <Cell label="Target planned cost" value={euros(envelope.targetCost)} />
                  <Cell
                    label="Planned cost (after)"
                    value={euros(envelope.after.plannedCost)}
                    sub={`before ${euros(envelope.before.plannedCost)}`}
                  />
                  <Cell
                    label="Remaining target cost"
                    value={euros(envelope.after.remainingCost)}
                    tone={envelope.after.remainingCost < 0 ? "danger" : undefined}
                  />
                </div>
                <div className="grid grid-cols-2 divide-x border-t text-center text-xs">
                  <Cell
                    label="This task"
                    value={`${h(envelope.task.hours)} · ${euros(envelope.task.cost)}`}
                  />
                  <Cell
                    label="Projected margin"
                    value={pct(envelope.after.projectedMargin)}
                    sub={
                      envelope.after.marginVariancePts == null
                        ? undefined
                        : `${envelope.after.marginVariancePts >= 0 ? "+" : ""}${Math.round(
                            envelope.after.marginVariancePts,
                          )} pts vs target`
                    }
                    tone={marginBelowTarget ? "danger" : undefined}
                  />
                </div>
              </>
            )}

            {(envelope.hoursOverBy > 0 || (canSeeFinancials && marginBelowTarget)) && (
              <div className="space-y-1 border-t bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {envelope.hoursOverBy > 0 && (
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Task allocation exceeds the remaining stage capacity by{" "}
                    {h(envelope.hoursOverBy)}.
                  </div>
                )}
                {canSeeFinancials && marginBelowTarget && (
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Projected stage margin falls to {pct(envelope.after.projectedMargin)}, below the{" "}
                    {pct(targetMargin)} target
                    {envelope.costOverBy > 0
                      ? ` (${euros(envelope.costOverBy)} over the target planned cost)`
                      : ""}
                    .
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-name">Task name</Label>
              <Input
                id="task-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Floor plans"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={resourceId} onValueChange={setResourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {active.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.role ? ` · ${r.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StageTaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-notes">Notes</Label>
              <Textarea
                id="task-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional planning note"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-start">Start</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-end">Due</Label>
                <Input
                  id="task-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    setDays(Math.max(1, diffDays(startDate, next)));
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-days">Duration (days)</Label>
                <Input
                  id="task-days"
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-hpd">Hours / day</Label>
                <Input
                  id="task-hpd"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Allocated effort (Mon–Fri)
                </span>
                <span className="font-medium text-foreground">{h(draftHours)}</span>
              </div>
              {canSeeFinancials && (
                <div className="flex items-center justify-between">
                  <span>Planned cost ({euros(draftCostRate)}/h)</span>
                  <span className="font-medium text-foreground">
                    {euros(draftHours * draftCostRate)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>Calendar span</span>
                <span>
                  {workdays} working days · {totalCalendarHours.toFixed(1)}h calendar
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Window</span>
                <span>
                  {formatDate(startDate)} → {formatDate(endDate)}
                </span>
              </div>
              {outsideStage && (
                <Badge variant="outline" className="mt-1 text-[11px] font-normal">
                  Runs outside the stage window
                </Badge>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {isEdit ? "Save changes" : "Save task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger";
}) {
  return (
    <div className="px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={
          tone === "danger" ? "font-semibold text-destructive" : "font-semibold text-foreground"
        }
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
