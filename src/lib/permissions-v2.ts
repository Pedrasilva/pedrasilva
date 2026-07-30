/**
 * Permissions v2 — module/action/scope-based.
 *
 * Phase 1 covers: Projects, Scheduling, Timesheets, Financials.
 * HR & CRM continue to use the legacy keys in src/lib/permissions.ts.
 *
 * Effective permissions for a user are computed server-side as:
 *   role baseline (role_permissions) ∪ user grants − user revokes
 * Admins (app_role='admin') always pass every check.
 */

export type PmRole =
  | "admin"
  | "partner"
  | "project_lead"
  | "architect"
  | "hr"
  | "finance";

export type PermissionScope =
  | "own"
  | "assigned"
  | "team"
  | "department"
  | "all";

export type PermissionModule =
  | "Projects"
  | "Scheduling"
  | "Timesheets"
  | "Financials"
  | "CRM"
  | "HR"
  | "Finance";

export type V2PermissionKey =
  // Projects (operational)
  | "projects.view"
  | "projects.edit_planning"
  | "projects.edit_stages"
  // Projects (financial visibility)
  | "projects.view_financials"
  | "projects.view_margins"
  // Scheduling
  | "scheduling.view"
  | "scheduling.view_team"
  | "scheduling.edit"
  // Timesheets
  | "timesheets.log"
  | "timesheets.view_team"
  | "timesheets.approve"
  // Financials (cross-project)
  | "financials.view"
  | "financials.view_rates"
  // CRM (legacy: crm.companies / crm.contacts / crm.pipeline)
  | "crm.companies.view"
  | "crm.companies.edit"
  | "crm.contacts.view"
  | "crm.contacts.edit"
  | "crm.pipeline.view"
  | "crm.pipeline.edit"
  | "crm.quotes.manage"
  // HR (legacy: hr.* key family)
  | "hr.self.view"
  | "hr.collaborators.view"
  | "hr.collaborator.view"
  | "hr.collaborator.edit"
  | "hr.compensation.view"
  | "hr.benefits.submit"
  | "hr.benefits.approve"
  | "hr.leave.request"
  | "hr.leave.approve"
  | "hr.admin"
  // Finance / backoffice (legacy: finance.dashboard, hr.valor-bo, hr.subsidio-alimentacao)
  | "finance.dashboard.view"
  | "finance.documents.view"
  | "finance.documents.edit"
  | "finance.banking.view"
  | "finance.banking.edit"
  | "finance.reports.view"
  | "finance.settings.manage";


export interface PermissionDefinition {
  key: V2PermissionKey;
  module: PermissionModule;
  label: string;
  description: string;
  /** Scopes that are meaningful for this permission. */
  scopes: PermissionScope[];
  /** True if this is a financial permission (kept separate from operational). */
  financial?: boolean;
}

/**
 * Scope ordering — broader scopes satisfy narrower checks.
 * `own < assigned < team < department < all`
 */
export const SCOPE_RANK: Record<PermissionScope, number> = {
  own: 1,
  assigned: 2,
  team: 3,
  department: 4,
  all: 5,
};

export const PERMISSION_CATALOGUE: PermissionDefinition[] = [
  // Projects — operational
  {
    key: "projects.view",
    module: "Projects",
    label: "View projects",
    description: "List and open project details.",
    scopes: ["own", "assigned", "team", "all"],
  },
  {
    key: "projects.edit_planning",
    module: "Projects",
    label: "Edit planning",
    description: "Create/move allocations, stages, and dependencies.",
    scopes: ["assigned", "team", "all"],
  },
  {
    key: "projects.edit_stages",
    module: "Projects",
    label: "Edit stages",
    description: "Add, rename, baseline and reorder project stages.",
    scopes: ["assigned", "team", "all"],
  },
  // Projects — financial
  {
    key: "projects.view_financials",
    module: "Projects",
    label: "View project financials",
    description: "Revenue, cost, budget, and invoicing on the project page.",
    scopes: ["assigned", "team", "all"],
    financial: true,
  },
  {
    key: "projects.view_margins",
    module: "Projects",
    label: "View project margins",
    description: "Profit and margin % per stage and project.",
    scopes: ["assigned", "team", "all"],
    financial: true,
  },
  // Scheduling
  {
    key: "scheduling.view",
    module: "Scheduling",
    label: "View Gantt",
    description: "Open the global Gantt and per-project Gantt.",
    scopes: ["own", "team", "all"],
  },
  {
    key: "scheduling.view_team",
    module: "Scheduling",
    label: "View team allocations",
    description: "See workload and bookings of other people.",
    scopes: ["team", "department", "all"],
  },
  {
    key: "scheduling.edit",
    module: "Scheduling",
    label: "Edit allocations",
    description: "Move, add, remove allocations and toggle tentative/committed.",
    scopes: ["team", "all"],
  },
  // Timesheets
  {
    key: "timesheets.log",
    module: "Timesheets",
    label: "Log own time",
    description: "Submit your own timesheet entries.",
    scopes: ["own"],
  },
  {
    key: "timesheets.view_team",
    module: "Timesheets",
    label: "View team timesheets",
    description: "See entries of other people.",
    scopes: ["team", "department", "all"],
  },
  {
    key: "timesheets.approve",
    module: "Timesheets",
    label: "Approve timesheets",
    description: "Mark team timesheets as approved.",
    scopes: ["team", "all"],
  },
  // Financials (cross-project)
  {
    key: "financials.view",
    module: "Financials",
    label: "View financial dashboard",
    description: "Cross-project revenue, cost and profit indicators.",
    scopes: ["all"],
    financial: true,
  },
  {
    key: "financials.view_rates",
    module: "Financials",
    label: "View rates & costs",
    description: "Internal hourly costs, sale rates and rate overrides.",
    scopes: ["all"],
    financial: true,
  },
  // CRM
  {
    key: "crm.companies.view",
    module: "CRM",
    label: "View companies",
    description: "Client, supplier and prospect records (legacy crm.companies).",
    scopes: ["own", "team", "all"],
  },
  {
    key: "crm.companies.edit",
    module: "CRM",
    label: "Edit companies",
    description: "Create and update company records.",
    scopes: ["team", "all"],
  },
  {
    key: "crm.contacts.view",
    module: "CRM",
    label: "View contacts",
    description: "Contact directory (legacy crm.contacts).",
    scopes: ["own", "team", "all"],
  },
  {
    key: "crm.contacts.edit",
    module: "CRM",
    label: "Edit contacts",
    description: "Create and update contacts.",
    scopes: ["team", "all"],
  },
  {
    key: "crm.pipeline.view",
    module: "CRM",
    label: "View pipeline & proposals",
    description: "Opportunities, quotes and fee proposals (legacy crm.pipeline).",
    scopes: ["own", "assigned", "team", "all"],
  },
  {
    key: "crm.pipeline.edit",
    module: "CRM",
    label: "Edit pipeline",
    description: "Move opportunity stages, edit proposals and outcomes.",
    scopes: ["assigned", "team", "all"],
  },
  {
    key: "crm.quotes.manage",
    module: "CRM",
    label: "Manage quotes & templates",
    description: "Build quotes, templates and convert them to projects.",
    scopes: ["assigned", "team", "all"],
  },
  // HR
  {
    key: "hr.self.view",
    module: "HR",
    label: "View own HR record",
    description: "Own payslip snapshot, working days and personal data.",
    scopes: ["own"],
  },
  {
    key: "hr.collaborators.view",
    module: "HR",
    label: "View collaborator list",
    description: "People directory without opening individual records.",
    scopes: ["team", "department", "all"],
  },
  {
    key: "hr.collaborator.view",
    module: "HR",
    label: "Open collaborator record",
    description: "Individual HR record, excluding compensation values.",
    scopes: ["team", "department", "all"],
  },
  {
    key: "hr.collaborator.edit",
    module: "HR",
    label: "Edit collaborator record",
    description: "Update contracts, capacity and personal HR data.",
    scopes: ["department", "all"],
  },
  {
    key: "hr.compensation.view",
    module: "HR",
    label: "View compensation",
    description:
      "Salary snapshots, net/gross, benefits balances and comparison summary values.",
    scopes: ["own", "department", "all"],
    financial: true,
  },
  {
    key: "hr.benefits.submit",
    module: "HR",
    label: "Submit own benefit expenses",
    description: "Upload receipts and consult own benefit balance.",
    scopes: ["own"],
  },
  {
    key: "hr.benefits.approve",
    module: "HR",
    label: "Approve benefit expenses",
    description: "Approve or reject other collaborators' benefit expenses.",
    scopes: ["team", "department", "all"],
  },
  {
    key: "hr.leave.request",
    module: "HR",
    label: "Request own leave",
    description: "Submit and track own vacation requests.",
    scopes: ["own"],
  },
  {
    key: "hr.leave.approve",
    module: "HR",
    label: "Approve leave",
    description: "Approve or reject vacation requests of others.",
    scopes: ["team", "department", "all"],
  },
  {
    key: "hr.admin",
    module: "HR",
    label: "HR administration",
    description:
      "Permission matrix, meal allowance table, backoffice hourly value and HR configuration.",
    scopes: ["all"],
  },
  // Finance (backoffice module)
  {
    key: "finance.dashboard.view",
    module: "Finance",
    label: "View finance dashboard",
    description: "Office cash flow, income and expense indicators (legacy finance.dashboard).",
    scopes: ["all"],
    financial: true,
  },
  {
    key: "finance.documents.view",
    module: "Finance",
    label: "View financial documents",
    description: "Invoices, credit notes and receipts, issued and received.",
    scopes: ["all"],
    financial: true,
  },
  {
    key: "finance.documents.edit",
    module: "Finance",
    label: "Edit financial documents",
    description: "Create, edit and settle documents, expenses and payments.",
    scopes: ["all"],
    financial: true,
  },
  {
    key: "finance.banking.view",
    module: "Finance",
    label: "View banking",
    description: "Bank accounts, balances and transactions.",
    scopes: ["all"],
    financial: true,
  },
  {
    key: "finance.banking.edit",
    module: "Finance",
    label: "Manage banking",
    description: "Import statements, classify and reconcile transactions.",
    scopes: ["all"],
    financial: true,
  },
  {
    key: "finance.reports.view",
    module: "Finance",
    label: "View finance reports",
    description: "Cash flow, VAT, forecast and per-project financial reports.",
    scopes: ["all"],
    financial: true,
  },
  {
    key: "finance.settings.manage",
    module: "Finance",
    label: "Manage finance settings",
    description: "Classifications, VAT rates, classification rules and imports.",
    scopes: ["all"],
    financial: true,
  },
];


export const PERMISSION_BY_KEY = new Map(
  PERMISSION_CATALOGUE.map((p) => [p.key, p]),
);

export const ROLE_LABEL: Record<PmRole, string> = {
  admin: "Admin",
  partner: "Partner",
  project_lead: "Project Lead",
  architect: "Architect",
  hr: "HR",
  finance: "Finance",
};

export const ROLE_DESCRIPTION: Record<PmRole, string> = {
  admin: "Full access. Bypasses every permission check.",
  partner: "Read-only across the studio, including financials and margins.",
  project_lead:
    "Plans assigned projects, sees their financials, manages team time.",
  architect: "Production: own schedule and timesheet, project view only.",
  hr: "Operational visibility across people and time, no financials.",
  finance: "Financial visibility, no planning edits.",
};

export const ALL_ROLES: PmRole[] = [
  "admin",
  "partner",
  "project_lead",
  "architect",
  "hr",
  "finance",
];

export const MODULES: PermissionModule[] = [
  "Projects",
  "Scheduling",
  "Timesheets",
  "Financials",
  "CRM",
  "HR",
  "Finance",

];

export interface EffectivePermissionRow {
  key: V2PermissionKey;
  scope: PermissionScope;
  source: "role" | "override";
}

/**
 * Returns true if the user has at least the requested scope for a key.
 * Scope ordering: a broader granted scope satisfies a narrower request.
 *   own request  ← any scope
 *   team request ← team / department / all
 *   all request  ← all only
 */
export function hasModuleScope(
  effective: EffectivePermissionRow[],
  key: V2PermissionKey,
  required: PermissionScope,
): boolean {
  const requiredRank = SCOPE_RANK[required];
  return effective.some(
    (e) => e.key === key && SCOPE_RANK[e.scope] >= requiredRank,
  );
}

/**
 * Best (broadest) scope the user has for a permission key, or null.
 * Useful when filtering data: e.g. "show projects according to the broadest
 * scope the user has on projects.view".
 */
export function bestScope(
  effective: EffectivePermissionRow[],
  key: V2PermissionKey,
): PermissionScope | null {
  let best: PermissionScope | null = null;
  let bestRank = 0;
  for (const e of effective) {
    if (e.key !== key) continue;
    if (SCOPE_RANK[e.scope] > bestRank) {
      bestRank = SCOPE_RANK[e.scope];
      best = e.scope;
    }
  }
  return best;
}
