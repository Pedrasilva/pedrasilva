import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/projects/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import {
  useMyTasks,
  useUpdateTaskStatus,
  useLogTime,
  useTaskTimeEntries,
  useDeleteTimeEntry,
  type MyTask,
  type TaskStatus,
} from "@/lib/projects/use-tasks";
import { ArrowRight, Pause, Play, CheckCircle2, Clock, Trash2, Inbox } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/projects/my-tasks")({
  component: MyTasksPage,
});

function MyTasksPage() {
  const { profile, user, isAdmin } = useProjectsAuth();
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const { data: tasks = [], isLoading } = useMyTasks({
    resourceId: profile?.resource_id ?? null,
    userId: user?.id ?? null,
    scope,
  });

  const noLink = !profile?.resource_id && scope === "mine";

  const groups = {
    pending: tasks.filter((t) => t.status === "pending"),
    active: tasks.filter((t) => t.status === "active" || t.status === "paused"),
    done: tasks.filter((t) => t.status === "done"),
  };

  return (
    <AppShell active="tasks">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">My Tasks</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Allocations placed on you. Accept a task to start clocking time against it.
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5 text-xs">
              <button
                onClick={() => setScope("mine")}
                className={`rounded px-3 py-1.5 ${
                  scope === "mine" ? "bg-accent text-foreground" : "text-muted-foreground"
                }`}
              >
                Mine
              </button>
              <button
                onClick={() => setScope("all")}
                className={`rounded px-3 py-1.5 ${
                  scope === "all" ? "bg-accent text-foreground" : "text-muted-foreground"
                }`}
              >
                Everyone
              </button>
            </div>
          )}
        </div>

        {noLink && (
          <div className="mt-6 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            A tua conta ainda não está ligada a um membro da equipa. Pede a um admin para te
            adicionar à{" "}
            <Link to="/projects/resources" className="underline">
              equipa
            </Link>{" "}
            com o mesmo email (<span className="font-mono">{user?.email}</span>).
          </div>
        )}

        <Tabs defaultValue="pending" className="mt-6">
          <TabsList>
            <TabsTrigger value="pending">
              Pending <Badge variant="secondary" className="ml-2">{groups.pending.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="active">
              Active <Badge variant="secondary" className="ml-2">{groups.active.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="done">
              Done <Badge variant="secondary" className="ml-2">{groups.done.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {isLoading ? (
              <SkeletonRows />
            ) : groups.pending.length === 0 ? (
              <Empty label="No pending tasks. Nice." />
            ) : (
              groups.pending.map((t) => <TaskCard key={t.id} task={t} canClock={false} />)
            )}
          </TabsContent>

          <TabsContent value="active" className="mt-4 space-y-3">
            {isLoading ? (
              <SkeletonRows />
            ) : groups.active.length === 0 ? (
              <Empty label="No active tasks. Accept one from Pending to start." />
            ) : (
              groups.active.map((t) => <TaskCard key={t.id} task={t} canClock={t.status === "active"} />)
            )}
          </TabsContent>

          <TabsContent value="done" className="mt-4 space-y-3">
            {isLoading ? (
              <SkeletonRows />
            ) : groups.done.length === 0 ? (
              <Empty label="No completed tasks yet." />
            ) : (
              groups.done.map((t) => <TaskCard key={t.id} task={t} canClock={false} />)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
      <Inbox className="mb-2 h-6 w-6 opacity-60" />
      {label}
    </div>
  );
}

function TaskCard({ task, canClock }: { task: MyTask; canClock: boolean }) {
  const updateStatus = useUpdateTaskStatus();
  const [logOpen, setLogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const stage = task.allocation?.stage;
  const project = stage?.project;
  const dailyH = Number(task.allocation?.hours_per_day ?? 0);
  const start = task.allocation?.start_date;
  const end = task.allocation?.end_date;

  async function setStatus(status: TaskStatus, msg: string) {
    try {
      await updateStatus.mutateAsync({ id: task.id, status });
      toast.success(msg);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not update task");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: project?.color ?? "#888" }}
              aria-hidden
            />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {project?.client ? `${project.client} · ` : ""}
              {project?.name ?? "Project"}
            </span>
            <StatusBadge status={task.status} />
          </div>
          <h3 className="mt-1 font-display text-lg font-medium leading-tight">
            {stage?.name ?? task.name}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>
              {start && format(new Date(start), "MMM d")} →{" "}
              {end && format(new Date(end), "MMM d, yyyy")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Suggested {dailyH}h/day
            </span>
            <span>
              Logged today: <strong className="text-foreground">{task.hours_logged_today.toFixed(1)}h</strong>
            </span>
            <span>
              Total: <strong className="text-foreground">{task.hours_logged_total.toFixed(1)}h</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {task.status === "pending" && (
            <Button size="sm" onClick={() => setStatus("active", "Task accepted")}>
              <ArrowRight className="mr-1 h-3.5 w-3.5" />
              Accept
            </Button>
          )}

          {task.status === "active" && (
            <>
              <Button size="sm" onClick={() => setLogOpen(true)}>
                <Clock className="mr-1 h-3.5 w-3.5" />
                Log time
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("paused", "Task paused")}>
                <Pause className="mr-1 h-3.5 w-3.5" />
                Pause
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("done", "Task completed")}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Done
              </Button>
            </>
          )}

          {task.status === "paused" && (
            <>
              <Button size="sm" onClick={() => setStatus("active", "Task resumed")}>
                <Play className="mr-1 h-3.5 w-3.5" />
                Resume
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("done", "Task completed")}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Done
              </Button>
            </>
          )}

          {task.status === "done" && (
            <Button size="sm" variant="outline" onClick={() => setStatus("active", "Task reopened")}>
              Reopen
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
            History
          </Button>
        </div>
      </div>

      {logOpen && (
        <LogTimeDialog
          task={task}
          dailyH={dailyH}
          onClose={() => setLogOpen(false)}
        />
      )}
      {historyOpen && (
        <HistoryDialog task={task} onClose={() => setHistoryOpen(false)} />
      )}

      {!canClock && task.status === "pending" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Accept this task to begin clocking time against it.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const styles: Record<TaskStatus, string> = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    paused: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
    done: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[status]}`}>
      {status}
    </span>
  );
}

function LogTimeDialog({ task, dailyH, onClose }: { task: MyTask; dailyH: number; onClose: () => void }) {
  const { user } = useProjectsAuth();
  const logTime = useLogTime();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState(String(dailyH || 1));
  const [notes, setNotes] = useState("");

  async function submit() {
    if (!user) return toast.error("Not signed in");
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return toast.error("Enter valid hours");
    try {
      await logTime.mutateAsync({
        task_id: task.id,
        user_id: user.id,
        entry_date: date,
        hours: h,
        notes: notes.trim() || undefined,
      });
      toast.success(`Logged ${h}h on ${date}`);
      onClose();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not log time");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log time</DialogTitle>
          <DialogDescription>
            {task.allocation?.stage?.project?.name} · {task.allocation?.stage?.name} · suggested {dailyH}h/day
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hours">Hours</Label>
              <Input
                id="hours"
                type="number"
                step="0.25"
                min="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="What did you work on?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={logTime.isPending}>
            {logTime.isPending ? "Saving…" : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ task, onClose }: { task: MyTask; onClose: () => void }) {
  const { data: entries = [], isLoading } = useTaskTimeEntries(task.id);
  const del = useDeleteTimeEntry();
  const total = entries.reduce((s, e) => s + Number(e.hours), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Time history</DialogTitle>
          <DialogDescription>
            {task.allocation?.stage?.project?.name} · {task.allocation?.stage?.name} ·{" "}
            <strong>{total.toFixed(1)}h logged</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-auto">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No entries yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <strong>{Number(e.hours).toFixed(2)}h</strong> ·{" "}
                      <span className="text-muted-foreground">{e.entry_date}</span>
                    </div>
                    {e.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{e.notes}</p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => del.mutate({ id: e.id, task_id: task.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Separator />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
