import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2,
  Shield,
  Upload,
  FolderKanban,
  Calculator,
  CalendarCheck,
  Utensils,
  Wallet,
  Users,
  Settings,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminHubPage,
});

type AdminLink = {
  to: string;
  label: string;
  description: string;
  icon: typeof Shield;
};

type AdminGroup = {
  title: string;
  description?: string;
  links: AdminLink[];
};

const GROUPS: AdminGroup[] = [
  {
    title: "Definições da empresa",
    description: "Dados fiscais partilhados entre Finance, OCR e HR.",
    links: [
      {
        to: "/admin/company-settings",
        label: "Definições fiscais da empresa",
        description:
          "Nome, NIF/VAT e definições de faturação usadas por Finance e pela deteção de fornecedor por OCR.",
        icon: Building2,
      },
      {
        to: "/finance",
        label: "Fornecedores e clientes (master data)",
        description:
          "Tabela canónica de empresas partilhada por Finance, Projetos, HR e OCR. Abre o separador no Finance.",
        icon: Users,
      },
    ],
  },
  {
    title: "Utilizadores e permissões",
    links: [
      {
        to: "/hr/admin",
        label: "Permissões e administração HR",
        description:
          "Matriz de permissões, colaboradores pendentes e ferramentas de administração HR.",
        icon: Shield,
      },
    ],
  },
  {
    title: "Configuração HR",
    links: [
      {
        to: "/hr/dias-uteis",
        label: "Dias úteis",
        description: "Calendário de dias úteis e feriados usado pelo cálculo salarial.",
        icon: CalendarCheck,
      },
      {
        to: "/hr/valor-bo",
        label: "Valor BO/hora",
        description: "Valor Backoffice por hora usado em alocações internas.",
        icon: Calculator,
      },
      {
        to: "/hr/subsidio-alimentacao",
        label: "Subsídio de alimentação",
        description: "Tabela e regras do subsídio de alimentação.",
        icon: Utensils,
      },
      {
        to: "/hr/beneficios",
        label: "Benefícios",
        description: "Configuração e administração de recibos de benefícios HR.",
        icon: Wallet,
      },
    ],
  },
  {
    title: "Catálogos comerciais",
    description: "Listas partilhadas pelas fichas de colaborador e pelo Quote Builder.",
    links: [
      {
        to: "/admin/proposal-roles",
        label: "Títulos / Funções comerciais",
        description:
          "Junior Architect, Architect, Senior Architect, Partner, Project Lead… Catálogo usado nas fichas e nas propostas. Horas e valor de venda no Quote Builder são apresentados por título.",
        icon: Users,
      },
    ],
  },
  {

    title: "Ferramentas de sistema",
    links: [
      {
        to: "/admin/imports",
        label: "Importações",
        description: "Importação de dados, sincronização Drive e backfills.",
        icon: Upload,
      },
      {
        to: "/admin/backups",
        label: "Backups (Google Drive)",
        description:
          "Cópias de segurança automáticas (diárias e semanais) e manuais de toda a base de dados, com auditoria e ligação ao ficheiro no Google Drive.",
        icon: Database,
      },
      {
        to: "/admin/projects",
        label: "Projetos (admin)",
        description: "Ferramentas administrativas e de integridade para projetos.",
        icon: FolderKanban,
      },
      {
        to: "/hr",
        label: "Colaboradores",
        description: "Gestão de colaboradores da equipa.",
        icon: Users,
      },
    ],
  },
];

function AdminHubPage() {
  return (
    <AdminOnly>
      <div className="mx-auto max-w-6xl space-y-8 p-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Settings className="h-6 w-6" /> Administração
          </h1>
          <p className="text-sm text-muted-foreground">
            Ponto único de acesso a configurações da empresa, HR, Finance, permissões e ferramentas de sistema.
          </p>
        </div>

        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h2>
              {group.description && (
                <p className="text-xs text-muted-foreground">{group.description}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.links.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="group block focus:outline-none"
                  >
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/30">
                      <CardHeader className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <CardTitle className="text-base">{link.label}</CardTitle>
                        </div>
                        <CardDescription className="text-xs leading-relaxed">
                          {link.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <span className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          Abrir →
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AdminOnly>
  );
}
