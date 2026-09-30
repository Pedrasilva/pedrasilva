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
  Armchair,
  Boxes,
  Briefcase,
  Building2,
  Users,
  Clock,
  Receipt,
  Settings,
  Inbox,
  Megaphone,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";
import type { ModuleId } from "@/lib/module-access";
import type { PermissionScope, V2PermissionKey } from "@/lib/permissions-v2";

export type FlyoutLink = {
  to: string;
  labelKey: string;
  perm?: PermissionKey;
  /** Optional v2 permission (module + scope) required for the link to show. */
  permV2?: V2PermissionKey;
  /** Minimum scope for `permV2`; defaults to "team". */
  permV2Scope?: PermissionScope;
  /** Requires finance access (useFinanceAccess — same check as the /finance guard). */
  requiresFinance?: boolean;
  /** Optional live count shown next to the label. */
  badge?: "marketingQuestions";
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
  /** Path prefixes that must NOT mark this item active (owned by another item). */
  excludes?: string[];
  /** Module whose access rule (src/lib/module-access.ts) gates this entry. */
  moduleId: ModuleId;
  /** Pin to the bottom of the rail. */
  pinBottom?: boolean;
  flyout: FlyoutSection[];
};

export const RAIL_ITEMS: RailItem[] = [
  // ─── CRM / Sales ───
  {
    id: "crm",
    moduleId: "crm",
    labelKey: "crm",
    icon: Building2,
    to: "/crm",
    matches: ["/crm", "/proposals"],
    flyout: [
      {
        titleKey: "sharedLists",
        links: [
          { to: "/crm/companies", labelKey: "crm.companies" },
          { to: "/crm/contacts", labelKey: "crm.contacts" },
          { to: "/crm/opportunities", labelKey: "crm.opportunities" },
          {
            to: "/proposals",
            labelKey: "crm.proposals",
            permV2: "crm.pipeline.view",
            permV2Scope: "own",
          },
        ],
      },
      {
        titleKey: "shortcuts",
        links: [
          
          { to: "/crm/quote-templates", labelKey: "crm.quoteTemplates" },
        ],
      },
    ],
  },

  // ─── Projects ───
  {
    id: "projects",
    moduleId: "projects",
    labelKey: "projects",
    icon: Briefcase,
    to: "/projects",
    matches: ["/projects"],
    excludes: ["/projects/timesheet", "/projects/my-tasks", "/projects/weekly-approval"],
    flyout: [
      {
        titleKey: "sharedLists",
        links: [
          { to: "/projects", labelKey: "projects.all" },
          { to: "/projects/resources", labelKey: "projects.team" },
        ],
      },
      {
        titleKey: "shortcuts",
        links: [{ to: "/projects/gantt", labelKey: "projects.gantt" }],
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
    moduleId: "hr",
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
    moduleId: "time",
    labelKey: "time",
    icon: Clock,
    to: "/projects/timesheet",
    matches: ["/projects/timesheet", "/projects/my-tasks", "/projects/weekly-approval"],
    flyout: [
      {
        titleKey: "shortcuts",
        links: [
          { to: "/projects/timesheet", labelKey: "time.timesheet" },
          { to: "/projects/my-tasks", labelKey: "time.myTasks" },
          {
            to: "/projects/weekly-approval",
            labelKey: "time.weeklyApproval",
            permV2: "timesheets.approve",
            permV2Scope: "team",
          },
        ],
      },
    ],

  },

  // ─── Finance ───
  {
    id: "finance",
    moduleId: "finance",
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

  // ─── Inbox (email triage) ───
  {
    id: "inbox",
    moduleId: "inbox",
    labelKey: "inbox",
    icon: Inbox,
    to: "/inbox",
    matches: ["/inbox"],
    flyout: [
      {
        titleKey: "shortcuts",
        links: [
          { to: "/inbox", labelKey: "inbox.triage" },
          { to: "/inbox/settings", labelKey: "inbox.settings" },
        ],
      },
    ],
  },

  // ─── Inventory (asset register) ───
  {
    id: "inventory",
    moduleId: "inventory",
    labelKey: "inventory",
    icon: Boxes,
    to: "/inventory",
    matches: ["/inventory"],
    flyout: [
      {
        titleKey: "sharedLists",
        links: [
          { to: "/inventory/assets", labelKey: "inventory.assets" },
          { to: "/inventory/assignments", labelKey: "inventory.assignments" },
        ],
      },
      {
        titleKey: "reports",
        links: [{ to: "/inventory/reports", labelKey: "inventory.reports" }],
      },
    ],
  },


  // ─── Product Library (specifications) ───
  {
    id: "products",
    moduleId: "products",
    labelKey: "products",
    icon: Armchair,
    to: "/products",
    matches: ["/products"],
    flyout: [
      {
        titleKey: "sharedLists",
        links: [
          { to: "/products", labelKey: "products.projects" },
          { to: "/products/library", labelKey: "products.library" },
        ],
      },
      {
        titleKey: "shortcuts",
        links: [{ to: "/products/categories", labelKey: "products.categories" }],
      },
    ],
  },

  // ─── Marketing (content pool) ───
  {
    id: "marketing",
    moduleId: "marketing",
    labelKey: "marketing",
    icon: Megaphone,
    to: "/marketing",
    matches: ["/marketing"],
    flyout: [
      {
        titleKey: "sharedLists",
        links: [
          { to: "/marketing", labelKey: "marketing.inbox" },
          { to: "/marketing/bible", labelKey: "marketing.bible" },
          { to: "/marketing/projects", labelKey: "marketing.projects" },
          { to: "/marketing/posts", labelKey: "marketing.posts", permV2: "marketing.curate", permV2Scope: "all" },
          { to: "/marketing/questions", labelKey: "marketing.questions", permV2: "marketing.curate", permV2Scope: "all", badge: "marketingQuestions" },
        ],
      },
    ],
  },

  // ─── Reports ───
  {
    id: "reports",
    moduleId: "reports",
    labelKey: "reports",
    icon: BarChart3,
    to: "/reports",
    matches: ["/reports"],
    flyout: [
      {
        titleKey: "reports",
        links: [{ to: "/reports/hours", labelKey: "reports.hours" }],
      },
    ],
  },

  // ─── Settings (pinned bottom) ───
  {
    id: "settings",
    moduleId: "settings",
    labelKey: "settings",
    icon: Settings,
    to: "/admin",
    matches: ["/admin", "/hr/admin", "/hr/valor-bo", "/hr/dias-uteis", "/hr/subsidio-alimentacao"],
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

const underPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + "/");

/** Single active-state rule for rail, module tabs and the mobile sheet. */
export function isRailItemActive(item: RailItem, pathname: string): boolean {
  if (item.excludes?.some((e) => underPrefix(pathname, e))) return false;
  return item.matches.some((m) => underPrefix(pathname, m));
}
