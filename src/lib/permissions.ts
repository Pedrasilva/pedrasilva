/**
 * Definição central de chaves de permissão e dos seus rótulos para a UI.
 * Cada rota sensível tem uma chave; admin tem tudo automaticamente (lado BD).
 */

export type PermissionKey =
  // HR
  | "hr.minha-ficha"
  | "hr.dias-uteis"
  | "hr.beneficios.own"
  | "hr.beneficios.approve"
  | "hr.ferias.own"
  | "hr.colaboradores"
  | "hr.colaborador.view"
  | "hr.colaborador.compensation.view"
  | "hr.colaborador.edit"
  | "hr.resumo"
  | "hr.resumo.compensation.view"
  | "hr.admin"
  | "hr.subsidio-alimentacao"
  | "hr.valor-bo"
  // CRM
  | "crm.companies"
  | "crm.contacts"
  | "crm.pipeline"
  // Projects
  | "projects.all"
  | "projects.gantt"
  | "projects.resources"
  | "projects.my-tasks"
  | "projects.timesheet"
  | "projects.financials"
  // Finance (backoffice)
  | "finance.dashboard";

export type PermissionGroup = {
  module: "HR" | "CRM" | "Projects" | "Finance";
  items: { key: PermissionKey; label: string; description?: string }[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: "HR",
    items: [
      { key: "hr.minha-ficha", label: "Minha ficha", description: "Ver a sua própria ficha salarial" },
      { key: "hr.dias-uteis", label: "Dias úteis", description: "Calendário e feriados" },
      { key: "hr.beneficios.own", label: "Benefícios próprios", description: "Submeter despesas e ver saldo" },
      { key: "hr.beneficios.approve", label: "Aprovar benefícios", description: "Aprovar/rejeitar despesas de benefícios de outros colaboradores" },
      { key: "hr.ferias.own", label: "Férias próprias", description: "Pedir e ver férias" },
      { key: "hr.colaboradores", label: "Colaboradores — lista", description: "Ver a lista de colaboradores (sem abrir ficha)." },
      { key: "hr.colaborador.view", label: "Colaborador — abrir ficha", description: "Abrir a ficha individual de outros colaboradores (sem valores financeiros)." },
      { key: "hr.colaborador.compensation.view", label: "Colaborador — ver compensação", description: "Ver salário, benefícios, liquidez e custos na ficha individual." },
      { key: "hr.colaborador.edit", label: "Colaborador — editar ficha", description: "Editar dados de colaborador." },
      { key: "hr.resumo", label: "Resumo comparativo", description: "Aceder ao resumo entre colaboradores (sem valores)." },
      { key: "hr.resumo.compensation.view", label: "Resumo — ver valores", description: "Ver valores salariais no resumo comparativo." },
      { key: "hr.admin", label: "HR — administração", description: "Gerir permissões e configuração avançada de HR." },
      { key: "hr.subsidio-alimentacao", label: "Subsídio alimentação (config)", description: "Configurar tabela do subsídio" },
      { key: "hr.valor-bo", label: "Valor BO/hora", description: "Configuração financeira do backoffice" },
    ],
  },
  {
    module: "CRM",
    items: [
      { key: "crm.companies", label: "Empresas" },
      { key: "crm.contacts", label: "Contactos" },
      { key: "crm.pipeline", label: "Pipeline & Propostas" },
    ],
  },
  {
    module: "Projects",
    items: [
      { key: "projects.all", label: "Todos os projectos", description: "Lista completa e detalhe de qualquer projecto" },
      { key: "projects.gantt", label: "Gantt global" },
      { key: "projects.resources", label: "Recursos" },
      { key: "projects.my-tasks", label: "Minhas tarefas" },
      { key: "projects.timesheet", label: "Timesheet" },
      {
        key: "projects.financials",
        label: "Indicadores financeiros",
        description:
          "Ver receita, custo, margem e orçamento no dashboard. Sem esta permissão, são mostrados apenas indicadores de tempo (planeado/realizado).",
      },
    ],
  },
  {
    module: "Finance",
    items: [
      {
        key: "finance.dashboard",
        label: "Painel financeiro",
        description: "Aceder ao dashboard financeiro do escritório (cash flow, receitas, despesas, bancos).",
      },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_GROUPS.flatMap(
  (g) => g.items.map((i) => i.key),
);
