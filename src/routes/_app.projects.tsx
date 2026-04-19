import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Briefcase, Users, ListChecks, CalendarClock, GanttChartSquare } from "lucide-react";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import { useProjects } from "@/lib/projects/use-planner";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Início
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Briefcase className="h-7 w-7" /> Projectos
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Estrutura criada. Componentes Gantt, alocações, dependências e equipa prontos.
            As rotas filhas ficam por activar nas próximas iterações.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <NavCard icon={GanttChartSquare} title="Gantt global" description="Todos os projectos numa só timeline" />
        <NavCard icon={Users} title="Equipa" description="Recursos, tarifas e capacidade" />
        <NavCard icon={ListChecks} title="Minhas tarefas" description="Aceitar e fechar tarefas" />
        <NavCard icon={CalendarClock} title="Timesheet" description="Lançar horas semanais" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Projectos {projects ? `(${projects.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : !projects?.length ? (
            <p className="text-sm text-muted-foreground">Sem projectos ainda. Cria o primeiro acima.</p>
          ) : (
            <ul className="divide-y divide-border">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.name}</p>
                    {p.client && <p className="text-xs text-muted-foreground">{p.client}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NavCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Briefcase;
  title: string;
  description: string;
}) {
  return (
    <Card className="opacity-70">
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Rota por activar</p>
        </div>
      </CardContent>
    </Card>
  );
}
