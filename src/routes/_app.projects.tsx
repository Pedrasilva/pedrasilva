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
            <CardTitle>Em construção</CardTitle>
          </div>
          <CardDescription>
            O conteúdo deste módulo virá da migração do projecto Stagecraft (Gantt, alocação de
            recursos, timesheets) para dentro deste ecosistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Próximo passo: criar as tabelas necessárias na base de dados e migrar UI/lógica.
        </CardContent>
      </Card>
    </div>
  );
}
