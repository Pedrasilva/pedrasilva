/**
 * Module visibility & access — single rule set used by the rail, header tabs,
 * mobile sheet, home module cards and the route guard in the app layout.
 *
 * A user passes a module if ANY listed permission is held (v2 key at the given
 * minimum scope, or a legacy v1 key). Admins always pass. Path prefixes come
 * from nav-config (RAIL_ITEMS matches/excludes); Portfolio has no rail item so
 * its prefix lives here.
 *
 * UX/navigation only — data security is enforced by RLS.
 */
import { useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { useFinanceAccess } from "@/hooks/use-finance-access";
import type { PermissionKey } from "@/lib/permissions";
import type { PermissionScope, V2PermissionKey } from "@/lib/permissions-v2";
import { RAIL_ITEMS, isRailItemActive } from "@/components/shell/nav-config";

export type ModuleId =
  | "crm"
  | "projects"
  | "time"
  | "hr"
  | "finance"
  | "inbox"
  | "inventory"
  | "products"
  | "portfolio"
  | "marketing"
  | "settings";

type ModuleRule = {
  v2?: { key: V2PermissionKey; scope: PermissionScope }[];
  v1?: PermissionKey[];
  /** Any v1 key starting with this prefix. */
  v1Prefix?: string;
  finance?: boolean;
  adminOnly?: boolean;
};

export const MODULE_RULES: Record<ModuleId, ModuleRule> = {
  crm: {
    v2: [
      { key: "crm.companies.view", scope: "own" },
      { key: "crm.contacts.view", scope: "own" },
      { key: "crm.pipeline.view", scope: "own" },
    ],
    v1: ["crm.companies", "crm.contacts", "crm.pipeline"],
  },
  projects: { v2: [{ key: "projects.view", scope: "own" }], v1: ["projects.all"] },
  time: { v2: [{ key: "timesheets.log", scope: "own" }], v1: ["projects.timesheet"] },
  hr: { v2: [{ key: "hr.self.view", scope: "own" }], v1Prefix: "hr." },
  finance: { finance: true },
  inbox: { v1: ["inbox.triage"] },
  inventory: { v2: [{ key: "inventory.view", scope: "all" }] },
  products: { v2: [{ key: "products.view", scope: "all" }] },
  portfolio: { v2: [{ key: "portfolio.view", scope: "all" }] },
  marketing: { v2: [{ key: "marketing.view", scope: "own" }] },
  settings: { adminOnly: true },
};

/** Prefixes for modules without a rail item. */
const EXTRA_PREFIXES: Partial<Record<ModuleId, string[]>> = {
  portfolio: ["/portfolio"],
};

const under = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + "/");

/**
 * Which module owns a pathname. Settings is checked first (it owns some /hr
 * admin pages), then rail items in order (projects excludes the time paths).
 */
export function moduleForPath(pathname: string): ModuleId | null {
  const settings = RAIL_ITEMS.find((r) => r.moduleId === "settings");
  if (settings && isRailItemActive(settings, pathname)) return "settings";
  for (const item of RAIL_ITEMS) {
    if (isRailItemActive(item, pathname)) return item.moduleId;
  }
  for (const [id, prefixes] of Object.entries(EXTRA_PREFIXES)) {
    if (prefixes?.some((p) => under(pathname, p))) return id as ModuleId;
  }
  return null;
}

export function useModuleAccess() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { permissions, loading: v1Loading } = useMyPermissions();
  const { can: canV2, loading: v2Loading } = useMyPermissionsV2();
  const { hasAccess: hasFinance, isLoading: finLoading } = useFinanceAccess();

  const loading = authLoading || (!isAdmin && (v1Loading || v2Loading || finLoading));

  const canAccess = useCallback(
    (id: ModuleId) => {
      if (isAdmin) return true;
      const r = MODULE_RULES[id];
      if (r.adminOnly) return false;
      if (r.finance) return hasFinance;
      if (r.v2?.some((x) => canV2(x.key, x.scope))) return true;
      if (r.v1?.some((k) => permissions.has(k))) return true;
      if (r.v1Prefix && [...permissions].some((k) => k.startsWith(r.v1Prefix!))) return true;
      return false;
    },
    [isAdmin, hasFinance, canV2, permissions],
  );

  return useMemo(() => ({ canAccess, moduleForPath, loading }), [canAccess, loading]);
}
