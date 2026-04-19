import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, ArrowLeft, Construction } from "lucide-react";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Hub
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-primary" /> Projects
        </h1>
        <p className="text-sm text-muted-foreground">Gestão de projectos, recursos e timesheets.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Fase 3 em curso — fundação pronta</CardTitle>
          </div>
          <CardDescription>
            Migração do Stagecraft para o ecosistema. Base de dados (Fase 2) já está pronta com
            as tabelas pm_projects, pm_stages, pm_resources, pm_allocations, pm_tasks,
            pm_time_entries e pm_stage_dependencies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Já portado nesta fase:</strong>
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Camada de dados completa em <code className="text-xs">src/lib/projects/</code>:
              hooks use-planner, use-tasks e use-timesheet, todos adaptados para as tabelas
              pm_*.
            </li>
            <li>
              Utilitários: gantt-utils, dependencies (cascata FS/SS/FF/SF), overload e
              time-format.
            </li>
            <li>Tokens CSS para o canvas Gantt e medidor de orçamento (light + dark).</li>
          </ul>
          <p className="pt-2">
            <strong className="text-foreground">Próximo passo:</strong> portar componentes UI
            (gantt-chart, resource-pool, dialogs, editors) e criar as rotas
            /projects/$projectId, /projects/gantt, /projects/resources, /projects/timesheet e
            /projects/my-tasks.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
