import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, Briefcase, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PermissionKey } from "@/lib/permissions";

export const Route = createFileRoute("/_app/")({
  component: HubPage,
});

type ModuleDef = {
  to: "/hr" | "/crm" | "/projects";
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Chaves de permissão que dão acesso a este módulo (qualquer uma serve). */
  anyOf: PermissionKey[];
  fallback?: { to: "/hr/minha-ficha"; label: string };
};

const MODULES: ModuleDef[] = [
  {
    to: "/hr",
    title: "HR",
    subtitle: "Recursos Humanos",
    description: "A sua ficha, férias, benefícios e (para gestores) a equipa.",
    icon: Users,
    anyOf: [
      "hr.minha-ficha",
      "hr.ferias.own",
      "hr.beneficios.own",
      "hr.colaboradores",
      "hr.resumo",
      "hr.dias-uteis",
    ],
    fallback: { to: "/hr/minha-ficha", label: "Minha ficha" },
  },
  {
    to: "/crm",
    title: "CRM",
    subtitle: "Clientes & Contactos",
    description: "Empresas, contactos, propostas e pipeline comercial.",
    icon: Building2,
    anyOf: ["crm.companies", "crm.contacts", "crm.pipeline"],
  },
  {
    to: "/projects",
    title: "Projects",
    subtitle: "Projectos & Recursos",
    description: "Projectos, alocação, gantt, tarefas e timesheets.",
    icon: Briefcase,
    anyOf: [
      "projects.all",
      "projects.gantt",
      "projects.resources",
      "projects.my-tasks",
      "projects.timesheet",
    ],
  },
];

function HubPage() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const { permissions, loading: permsLoading } = useMyPermissions();
  const loading = authLoading || permsLoading;

  const visible = useMemo(() => {
    if (isAdmin) return MODULES;
    return MODULES.filter((m) => m.anyOf.some((k) => permissions.has(k)));
  }, [isAdmin, permissions]);

  // Se só tem acesso à própria ficha, vai directo para lá.
  useEffect(() => {
    if (loading) return;
    if (!isAdmin && visible.length === 1 && visible[0].to === "/hr") {
      navigate({ to: "/hr/minha-ficha" });
    }
  }, [loading, isAdmin, visible, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        A carregar…
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sem módulos disponíveis</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A sua conta ainda não tem permissões atribuídas. Contacte um
          administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Ecosistema PSA</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Escolha um módulo. Todos partilham autenticação e dados."
            : "Aqui ficam os módulos a que tem acesso."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.to} to={m.to} className="block">
              <Card
                className={cn(
                  "group relative h-full overflow-hidden transition-all",
                  "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40",
                )}
              >
                <CardHeader className="space-y-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div>
                    <CardTitle className="text-2xl">{m.title}</CardTitle>
                    <CardDescription className="mt-0.5 text-xs uppercase tracking-wide">
                      {m.subtitle}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{m.description}</p>
                  <div className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Entrar
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
