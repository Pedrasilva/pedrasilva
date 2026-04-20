import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Inbox, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMyResourceId } from "@/lib/projects/use-my-resource";
import { useMyTasks, useUpdateTaskStatus, type MyTask, type TaskStatus } from "@/lib/projects/use-tasks";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/projects/my-tasks")({
  component: MyTasksPage,
});

function MyTasksPage() {
  const { user } = useAuth();
  const { data: resourceId } = useMyResourceId();
  const [scope] = useState<"mine" | "all">("mine");

  const { data: tasks = [], isLoading } = useMyTasks({
    resourceId: resourceId ?? null,
    userId: user?.id ?? null,
    scope,
  });

  const noLink = !resourceId;
  const groups = {
    pending: tasks.filter((t) => t.status === "pending"),
    active: tasks.filter((t) => t.status === "active" || t.status === "paused"),
    done: tasks.filter((t) => t.status === "done"),
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-8">
      <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Projectos
      </Link>

      <div className="mt-3 border-b border-border pb-5">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Minhas tarefas</h1>
        <p className="mt-2 text-sm text-muted-foreground">Aceita tarefas e regista horas. Diálogos de log/histórico por activar.</p>
      </div>

      {noLink && (
        <div className="mt-6 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          A tua conta ({user?.email}) ainda não está ligada a um membro da equipa.
        </div>
      )}

      <Tabs defaultValue="pending" className="mt-6">
        <TabsList>
          <TabsTrigger value="pending">Pendentes <Badge variant="secondary" className="ml-2">{groups.pending.length}</Badge></TabsTrigger>
          <TabsTrigger value="active">Activas <Badge variant="secondary" className="ml-2">{groups.active.length}</Badge></TabsTrigger>
          <TabsTrigger value="done">Feitas <Badge variant="secondary" className="ml-2">{groups.done.length}</Badge></TabsTrigger>
        </TabsList>
        {(["pending", "active", "done"] as const).map((k) => (
          <TabsContent key={k} value={k} className="mt-4 space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            ) : groups[k].length === 0 ? (
              <Empty />
            ) : (
              groups[k].map((t) => <TaskCard key={t.id} task={t} />)
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
      <Inbox className="mb-2 h-6 w-6 opacity-60" /> Sem tarefas.
    </div>
  );
}

function TaskCard({ task }: { task: MyTask }) {
  const upd = useUpdateTaskStatus();
  const stage = task.allocation?.stage;
  const project = stage?.project;
  const dailyH = Number(task.allocation?.hours_per_day ?? 0);

  async function setStatus(status: TaskStatus, msg: string) {
    try {
      await upd.mutateAsync({ id: task.id, status });
      toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: project?.color ?? "#888" }} />
            {project?.client ? `${project.client} · ` : ""}{project?.name ?? "Projecto"}
          </div>
          <h3 className="mt-1 font-display text-lg font-medium">{stage?.name ?? task.name}</h3>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>{task.allocation?.start_date && format(new Date(task.allocation.start_date), "MMM d")} → {task.allocation?.end_date && format(new Date(task.allocation.end_date), "MMM d, yyyy")}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Sugerido {dailyH}h/dia</span>
            <span>Total: <strong className="text-foreground">{task.hours_logged_total.toFixed(1)}h</strong></span>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {task.status === "pending" && <Button size="sm" onClick={() => setStatus("active", "Aceite")}>Aceitar</Button>}
          {task.status === "active" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setStatus("paused", "Pausada")}>Pausar</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("done", "Concluída")}>Concluir</Button>
            </>
          )}
          {task.status === "paused" && <Button size="sm" onClick={() => setStatus("active", "Retomada")}>Retomar</Button>}
          {task.status === "done" && <Button size="sm" variant="outline" onClick={() => setStatus("active", "Reaberta")}>Reabrir</Button>}
        </div>
      </div>
    </div>
  );
}
