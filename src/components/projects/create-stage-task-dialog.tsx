/**
 * Create a task inside a stage: name, assignee, schedule and effort. Saving
 * creates the allocation for that person and names its task.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Clock, UserRound } from "lucide-react";
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
import { useCreateStageTask } from "@/lib/projects/use-stage-tasks";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["pm_task_status"];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
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

export function CreateStageTaskDialog({
  open,
  onOpenChange,
  stageId,
  projectId,
  stageName,
  stageStart,
  stageEnd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stageId: string;
  projectId: string;
  stageName?: string;
  stageStart: string;
  stageEnd: string;
}) {
  const { data: resources } = useResources();
  const createTask = useCreateStageTask();

  const [name, setName] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [status, setStatus] = useState<TaskStatus>("pending");
  const [startDate, setStartDate] = useState(stageStart);
  const [days, setDays] = useState(1);
  const [hoursPerDay, setHoursPerDay] = useState(8);

  useEffect(() => {
    if (!open) return;
    setName("");
    setResourceId("");
    setStatus("pending");
    setStartDate(stageStart);
    setDays(1);
    setHoursPerDay(8);
  }, [open, stageStart]);

  const active = (resources ?? []).filter((r) => r.active !== false);
  const endDate = addDays(startDate, Math.max(1, days) - 1);
  const assignee = active.find((r) => r.id === resourceId);

  const workdays = useMemo(() => countWeekdays(startDate, endDate), [startDate, endDate]);
  const totalHours = Math.max(1, days) * (hoursPerDay || 0);
  const workdayHours = workdays * (hoursPerDay || 0);
  const outsideStage = startDate < stageStart || endDate > stageEnd;

  const submit = async () => {
    if (!name.trim()) return toast.error("Task name is required");
    if (!resourceId) return toast.error("Choose who the task is for");
    try {
      await createTask.mutateAsync({
        projectId,
        stage_id: stageId,
        resource_id: resourceId,
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        hours_per_day: hoursPerDay,
        status,
      });
      toast.success("Task created");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            {stageName ? `Splitting ${stageName} into a smaller task` : "Add a task to this stage"}
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
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
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
                  <Clock className="h-3.5 w-3.5" /> Effort
                </span>
                <span className="font-medium text-foreground">{totalHours.toFixed(1)}h</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Working days (Mon–Fri)</span>
                <span>
                  {workdays} · {workdayHours.toFixed(1)}h
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
          <Button onClick={submit} disabled={createTask.isPending}>
            Save task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
