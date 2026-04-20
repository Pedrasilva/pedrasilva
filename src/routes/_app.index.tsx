import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, Briefcase, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/")({
  component: HubPage,
});

type ModuleDef = {
  to: "/hr" | "/crm" | "/projects";
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  ready: boolean;
};

const MODULES: ModuleDef[] = [
  {
    to: "/hr",
    title: "HR",
    subtitle: "Recursos Humanos",
    description: "Colaboradores, salários, férias, benefícios e custo de equipa.",
    icon: Users,
    ready: true,
  },
  {
    to: "/crm",
    title: "CRM",
    subtitle: "Clientes & Contactos",
    description: "Empresas, contactos, propostas e pipeline comercial.",
    icon: Building2,
    ready: true,
  },
  {
    to: "/projects",
    title: "Projects",
    subtitle: "Projectos & Recursos",
    description: "Gestão de projectos, alocação de equipa, gantt e timesheets.",
    icon: Briefcase,
    ready: true,
  },
];

function HubPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();

  // Não-admins vão directamente para a sua ficha em HR
  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate({ to: "/hr/minha-ficha" });
    }
  }, [loading, isAdmin, navigate]);

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        A carregar…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Ecosistema PSA</h1>
        <p className="text-sm text-muted-foreground">
          Escolha um módulo. Todos partilham autenticação e dados — adicionaremos mais módulos no futuro.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const inner = (
            <Card
              className={cn(
                "group relative h-full overflow-hidden transition-all",
                m.ready
                  ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40"
                  : "opacity-70",
              )}
            >
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </span>
                  {!m.ready && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Em breve
                    </span>
                  )}
                </div>
                <div>
                  <CardTitle className="text-2xl">{m.title}</CardTitle>
                  <CardDescription className="mt-0.5 text-xs uppercase tracking-wide">
                    {m.subtitle}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{m.description}</p>
                {m.ready && (
                  <div className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Entrar
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                )}
              </CardContent>
            </Card>
          );

          if (!m.ready) {
            return (
              <div key={m.to} aria-disabled>
                {inner}
              </div>
            );
          }

          return (
            <Link key={m.to} to={m.to} className="block">
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
