/**
 * Access catalogue (Permissions redesign STEP 2 — PREVIEW ONLY).
 *
 * Nothing in the app reads this for real access yet. It drives the
 * Admin → Access preview screen and the target table `public.user_access`.
 * Labels/descriptions live in the `access` i18n namespace:
 *   access:items.<id with dots → _>.label / .description
 */

export type AccessLevel = "none" | "own" | "view" | "edit" | "team" | "all";
export type AccessTier = "standard" | "confidential";
export type AccessSection =
  | "projects"
  | "time"
  | "hr"
  | "products"
  | "portfolio"
  | "marketing"
  | "crm"
  | "finance"
  | "other";

/** A legacy key this item replaces. `level` is what holding it means today. */
export interface LegacyKey {
  system: "v1" | "v2";
  key: string;
  level: AccessLevel;
  /** v2 only: map scope → level (overrides `level`). */
  byScope?: Partial<Record<string, AccessLevel>>;
}

export interface AccessItem {
  id: string;
  section: AccessSection;
  tier: AccessTier;
  /** Levels above None, ordered narrow → broad. Confidential items also allow None. */
  levels: AccessLevel[];
  /** Standard items only. */
  defaultLevel?: AccessLevel;
  legacy: LegacyKey[];
}

const v1 = (key: string, level: AccessLevel): LegacyKey => ({ system: "v1", key, level });
const v2 = (key: string, level: AccessLevel, byScope?: LegacyKey["byScope"]): LegacyKey => ({
  system: "v2",
  key,
  level,
  byScope,
});

export const ACCESS_SECTIONS: AccessSection[] = [
  "projects",
  "time",
  "hr",
  "products",
  "portfolio",
  "marketing",
  "crm",
  "finance",
  "other",
];

export const ACCESS_CATALOGUE: AccessItem[] = [
  // ---------- STANDARD ----------
  {
    id: "projects.work", section: "projects", tier: "standard", levels: ["view"], defaultLevel: "view",
    legacy: [v2("projects.view", "view"), v2("scheduling.view", "view"), v1("projects.all", "view"),
      v1("projects.gantt", "view"), v1("projects.resources", "view"), v1("projects.my-tasks", "view")],
  },
  {
    id: "projects.plan", section: "projects", tier: "standard", levels: ["edit"], defaultLevel: "edit",
    legacy: [v2("projects.edit_planning", "edit"), v2("projects.edit_stages", "edit"), v2("scheduling.edit", "edit")],
  },
  {
    id: "projects.workload", section: "projects", tier: "standard", levels: ["view"], defaultLevel: "view",
    legacy: [v2("scheduling.view_team", "view")],
  },
  {
    id: "time.own", section: "time", tier: "standard", levels: ["own"], defaultLevel: "own",
    legacy: [v2("timesheets.log", "own"), v1("projects.timesheet", "own")],
  },
  {
    id: "time.team", section: "time", tier: "standard", levels: ["view"], defaultLevel: "view",
    legacy: [v2("timesheets.view_team", "view")],
  },
  {
    id: "hr.self", section: "hr", tier: "standard", levels: ["own"], defaultLevel: "own",
    legacy: [v2("hr.self.view", "own"), v2("hr.benefits.submit", "own"), v2("hr.leave.request", "own"),
      v2("hr.wfh.request", "own"), v1("hr.minha-ficha", "own"), v1("hr.dias-uteis", "own"),
      v1("hr.beneficios.own", "own"), v1("hr.ferias.own", "own")],
  },
  {
    id: "hr.availability", section: "hr", tier: "standard", levels: ["view"], defaultLevel: "view",
    legacy: [v1("hr.ferias.own", "view")],
  },
  {
    id: "products.use", section: "products", tier: "standard", levels: ["view"], defaultLevel: "view",
    legacy: [v2("products.view", "view")],
  },
  {
    id: "portfolio.view", section: "portfolio", tier: "standard", levels: ["view"], defaultLevel: "view",
    legacy: [v2("portfolio.view", "view")],
  },
  {
    id: "marketing.contribute", section: "marketing", tier: "standard", levels: ["edit"], defaultLevel: "edit",
    legacy: [v2("marketing.contribute", "edit")],
  },
  // ---------- CONFIDENTIAL ----------
  {
    id: "projects.financials", section: "projects", tier: "confidential", levels: ["view"],
    legacy: [v2("projects.view_financials", "view"), v2("projects.view_margins", "view"),
      v2("financials.view", "view"), v2("financials.view_rates", "view"), v1("projects.financials", "view")],
  },
  {
    id: "time.approve", section: "time", tier: "confidential", levels: ["team", "all"],
    legacy: [v2("timesheets.approve", "team", { team: "team", department: "team", all: "all" })],
  },
  {
    id: "hr.people", section: "hr", tier: "confidential", levels: ["view", "edit"],
    legacy: [v2("hr.collaborators.view", "view"), v2("hr.collaborator.view", "view"),
      v2("hr.collaborator.edit", "edit"), v1("hr.colaboradores", "view"), v1("hr.colaborador.view", "view"),
      v1("hr.resumo", "view"), v1("hr.colaborador.edit", "edit")],
  },
  {
    id: "hr.compensation", section: "hr", tier: "confidential", levels: ["view"],
    legacy: [v2("hr.compensation.view", "view", { own: "none", department: "view", all: "view" }),
      v1("hr.colaborador.compensation.view", "view"), v1("hr.resumo.compensation.view", "view")],
  },
  {
    id: "hr.approve", section: "hr", tier: "confidential", levels: ["edit"],
    legacy: [v2("hr.benefits.approve", "edit"), v2("hr.leave.approve", "edit"), v1("hr.beneficios.approve", "edit")],
  },
  {
    id: "hr.settings", section: "hr", tier: "confidential", levels: ["edit"],
    legacy: [v2("hr.admin", "edit"), v1("hr.admin", "edit"), v1("hr.subsidio-alimentacao", "edit"), v1("hr.valor-bo", "edit")],
  },
  {
    id: "products.edit", section: "products", tier: "confidential", levels: ["edit"],
    legacy: [v2("products.edit", "edit")],
  },
  {
    id: "marketing.curate", section: "marketing", tier: "confidential", levels: ["edit"],
    legacy: [v2("marketing.curate", "edit")],
  },
  {
    id: "marketing.bible", section: "marketing", tier: "confidential", levels: ["edit"],
    legacy: [v2("marketing.edit_bible", "edit")],
  },
  {
    id: "crm.view", section: "crm", tier: "confidential", levels: ["view"],
    legacy: [v2("crm.companies.view", "view"), v2("crm.contacts.view", "view"), v2("crm.pipeline.view", "view")],
  },
  {
    id: "crm.edit", section: "crm", tier: "confidential", levels: ["edit"],
    legacy: [v2("crm.companies.edit", "edit"), v2("crm.contacts.edit", "edit"), v2("crm.pipeline.edit", "edit"),
      v2("crm.quotes.manage", "edit"), v1("crm.companies", "edit"), v1("crm.contacts", "edit"), v1("crm.pipeline", "edit")],
  },
  {
    id: "finance.view", section: "finance", tier: "confidential", levels: ["view"],
    legacy: [v2("finance.dashboard.view", "view"), v2("finance.documents.view", "view"),
      v2("finance.banking.view", "view"), v2("finance.reports.view", "view")],
  },
  {
    id: "finance.edit", section: "finance", tier: "confidential", levels: ["edit"],
    legacy: [v2("finance.documents.edit", "edit"), v2("finance.banking.edit", "edit"),
      v2("finance.settings.manage", "edit"), v1("finance.dashboard", "edit")],
  },
  { id: "inbox", section: "other", tier: "confidential", levels: ["view"], legacy: [v1("inbox.triage", "view")] },
  { id: "reports", section: "other", tier: "confidential", levels: ["view"], legacy: [v2("reports.view", "view")] },
  { id: "inventory", section: "other", tier: "confidential", levels: ["view"], legacy: [v2("inventory.view", "view")] },
];

export const ACCESS_ITEM_BY_ID = new Map(ACCESS_CATALOGUE.map((i) => [i.id, i]));

/** i18n key segment for an item id ("projects.work" → "projects_work"). */
export const itemKey = (id: string) => id.replace(/\./g, "_");

/** All levels a control may offer for an item (None first for confidential). */
export function selectableLevels(item: AccessItem): AccessLevel[] {
  return item.tier === "confidential" ? ["none", ...item.levels] : ["none", ...item.levels];
}

/** Level an item has when no target row exists. */
export function baselineLevel(item: AccessItem): AccessLevel {
  return item.tier === "standard" ? (item.defaultLevel ?? "none") : "none";
}

function rank(item: AccessItem, level: AccessLevel): number {
  if (level === "none") return 0;
  const i = item.levels.indexOf(level);
  return i < 0 ? 0 : i + 1;
}

export interface CurrentSources {
  isAdmin: boolean;
  /** v2 effective rows (rank baseline ∪ grants − revokes). */
  v2: { key: string; scope: string }[];
  /** v1 personal keys with granted = true. */
  v1: string[];
}

/** Current real access for one item, computed from today's permission system. */
export function currentLevel(item: AccessItem, src: CurrentSources): AccessLevel {
  if (src.isAdmin) return item.levels[item.levels.length - 1];
  let best: AccessLevel = "none";
  const consider = (l: AccessLevel | undefined) => {
    if (l && rank(item, l) > rank(item, best)) best = l;
  };
  for (const lk of item.legacy) {
    if (lk.system === "v1") {
      if (src.v1.includes(lk.key)) consider(lk.level);
    } else {
      for (const row of src.v2) {
        if (row.key !== lk.key) continue;
        consider(lk.byScope?.[row.scope] ?? lk.level);
      }
    }
  }
  return best;
}
