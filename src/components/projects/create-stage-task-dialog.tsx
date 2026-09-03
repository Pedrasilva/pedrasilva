/**
 * Create a task inside a stage: name, assignee and duration. Saving creates
 * the allocation for that person and names its task.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResources } from "@/lib/projects/use-planner";
import { useCreateStageTask } from "@/lib/projects/use-stage-tasks";

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
  const [startDate, setStartDate] = useState(stageStart);
  const [days, setDays] = useState(1);
  const [hoursPerDay, setHoursPerDay] = useState(8);

  useEffect(() => {
    if (!open) return;
    setName("");
    setResourceId("");
    setStartDate(stageStart);
    setDays(1);
    setHoursPerDay(8);
  }, [open, stageStart]);

  const active = (resources ?? []).filter((r) => r.active !== false);
  const endDate = addDays(startDate, Math.max(1, days) - 1);

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
      });
      toast.success("Task created");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            {stageName ? `Stage: ${stageName}` : "Add a task to this stage"}
          </DialogDescription>
        </DialogHeader>

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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-start">Start</Label>
              <Input
                id="task-start"
                type="date"
                value={startDate}
                min={stageStart}
                max={stageEnd}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-days">Duration (days)</Label>
              <Input
                id="task-days"
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 1)}
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

          <p className="text-xs text-muted-foreground">
            Ends {endDate} · {(Math.max(1, days) * hoursPerDay).toFixed(1)}h total
          </p>
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
