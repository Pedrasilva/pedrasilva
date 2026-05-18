/**
 * Single source of truth for the global left rail + flyout panels.
 *
 * Each rail item maps a module (CRM, Projects, HR, Time, Finance, Insights,
 * Settings) to:
 *   - an icon + tooltip key
 *   - the default route used when the rail icon itself is clicked
 *   - a structured flyout (Shared lists / Shortcuts / Reports) shown on hover.
 *
 * Permission strings are checked against `useMyPermissions()` in the rail
 * component, with `isAdmin` always bypassing the check. Items with no `perm`
 * are visible to everyone authenticated.
 */
import {
  Briefcase,
  Building2,
  Users,
  Clock,
  Receipt,
  LineChart,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type FlyoutLink = {
  to: string;
  labelKey: string;
  perm?: PermissionKey;
};

export type FlyoutSection = {
  titleKey: string;
  links: FlyoutLink[];
};

export type RailItem = {
  id: string;
  /** i18n key under `common:shell.rail` */
  labelKey: string;
  icon: LucideIcon;
  /** Default destination when the rail icon is clicked. */
  to: string;
  /** Path prefixes that mark this item as active. */
  matches: string[];
  /** Permission required for the rail entry to be shown at all. */
  perm?: PermissionKey;
  /** Admin-only? */
  adminOnly?: boolean;
  /** Pin to the bottom of the rail. */
  pinBottom?: boolean;
  flyout: FlyoutSection[];
};

export const RAIL_ITEMS: RailItem[] = [
  // ─── CRM / Sales ───
  {
    id: "crm",
    labelKey: "crm",
    icon: Building2,
    to: "/crm",
    matches: ["/crm"],
    flyout: [
      {
        titleKey: "sharedLists",
        links: [
          { to: "/crm/companies", labelKey: "crm.companies" },
          { to: "/crm/contacts", labelKey: "crm.contacts" },
          { to: "/crm/opportunities", labelKey: "crm.opportunities" },
          { to: "/crm/pipeline", labelKey: "crm.pipeline" },
        ],
      },
      {
        titleKey: "shortcuts",
        links: [{ to: "/crm/accounts", labelKey: "crm.accounts" }],
      },
    ],
  },

  // ─── Projects ───
  {
    id: "projects",
    labelKey: "projects",
    icon: Briefcase,
    to: "/projects",
    matches: ["/projects"],
    flyout: [
      {
        titleKey: "sharedLists",
        links: [
          { to: "/projects", labelKey: "projects.all" },
          { to: "/projects/my-tasks", labelKey: "projects.myTasks" },
          { to: "/projects/resources", labelKey: "projects.team" },
        ],
      },
      {
        titleKey: "shortcuts",
        links: [
          { to: "/projects/gantt", labelKey: "projects.gantt" },
          { to: "/projects/timesheet", labelKey: "projects.timesheet" },
        ],
      },
      {
        titleKey: "reports",
        links: [
          { to: "/projects/financials", labelKey: "projects.financials", perm: "projects.financials" },
          { to: "/projects/forecast", labelKey: "projects.forecast", perm: "projects.financials" },
          { to: "/projects/insights", labelKey: "projects.insights", perm: "projects.financials" },
        ],
      },
    ],
  },

  // ─── Team / HR ───
  {
    id: "hr",
    labelKey: "hr",
    icon: Users,
    to: "/hr/minha-ficha",
    matches: ["/hr"],
    flyout: [
      {
        titleKey: "shortcuts",
        links: [
          { to: "/hr/minha-ficha", labelKey: "hr.mySheet" },
          { to: "/hr/ferias", labelKey: "hr.vacation" },
          { to: "/hr/beneficios", labelKey: "hr.benefits" },
        ],
      },
      {
        titleKey: "sharedLists",
        links: [
          { to: "/hr/colaboradores", labelKey: "hr.collaborators", perm: "hr.colaboradores" },
          { to: "/hr/resumo", labelKey: "hr.summary" },
        ],
      },
    ],
  },

  // ─── Time / Work ───
  {
    id: "time",
    labelKey: "time",
    icon: Clock,
    to: "/projects/timesheet",
    matches: ["/projects/timesheet", "/projects/my-tasks"],
    flyout: [
      {
        titleKey: "shortcuts",
        links: [
          { to: "/projects/timesheet", labelKey: "time.timesheet" },
          { to: "/projects/my-tasks", labelKey: "time.myTasks" },
        ],
      },
    ],
  },

  // ─── Finance ───
  {
    id: "finance",
    labelKey: "finance",
    icon: Receipt,
    to: "/finance",
    matches: ["/finance"],
    flyout: [
      {
        titleKey: "sharedLists",
        links: [
          { to: "/finance/documents", labelKey: "finance.documents" },
          { to: "/finance/invoicing/invoices", labelKey: "finance.invoices" },
          { to: "/finance/payments/suppliers", labelKey: "finance.suppliers" },
          { to: "/finance/banking/transactions", labelKey: "finance.banking" },
        ],
      },
      {
        titleKey: "reports",
        links: [
          { to: "/finance/reports/cashflow", labelKey: "finance.cashflow" },
          { to: "/finance/reports/forecast", labelKey: "finance.forecast" },
          { to: "/finance/reports/vat", labelKey: "finance.vat" },
          { to: "/finance/reports/projects", labelKey: "finance.projects" },
        ],
      },
    ],
  },

  // ─── Insights / Reports ───
  {
    id: "insights",
    labelKey: "insights",
    icon: LineChart,
    to: "/projects/insights",
    matches: ["/projects/insights", "/projects/forecast", "/projects/financials"],
    perm: "projects.financials",
    flyout: [
      {
        titleKey: "reports",
        links: [
          { to: "/projects/insights", labelKey: "insights.projects" },
          { to: "/projects/forecast", labelKey: "insights.forecast" },
          { to: "/projects/financials", labelKey: "insights.financials" },
          { to: "/finance/reports/cashflow", labelKey: "insights.cashflow" },
        ],
      },
    ],
  },

  // ─── Settings (pinned bottom) ───
  {
    id: "settings",
    labelKey: "settings",
    icon: Settings,
    to: "/admin",
    matches: ["/admin", "/hr/admin", "/hr/valor-bo", "/hr/dias-uteis", "/hr/subsidio-alimentacao"],
    adminOnly: true,
    pinBottom: true,
    flyout: [
      {
        titleKey: "shortcuts",
        links: [
          { to: "/admin", labelKey: "settings.general" },
          { to: "/admin/company-settings", labelKey: "settings.company" },
          { to: "/hr/admin", labelKey: "settings.hr" },
          { to: "/admin/imports", labelKey: "settings.imports" },
          { to: "/admin/projects", labelKey: "settings.projectsAdmin" },
        ],
      },
      {
        titleKey: "reports",
        links: [
          { to: "/hr/valor-bo", labelKey: "settings.boValue" },
          { to: "/hr/dias-uteis", labelKey: "settings.workingDays" },
          { to: "/hr/subsidio-alimentacao", labelKey: "settings.mealAllowance" },
        ],
      },
    ],
  },
];
