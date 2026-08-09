import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";
import { RAIL_ITEMS } from "./nav-config";

/** Modules surfaced as tabs in the global header, in display order. */
const TAB_IDS = ["crm", "projects", "finance", "hr"] as const;

/**
 * Module switcher rendered next to the logo. Gives the current section an
 * always-visible label and lets the user jump straight between modules
 * without going back to the hub (the logo still returns home).
 */
export function ModuleTabs() {
  const loc = useLocation();
  const { t } = useTranslation("common");
  const { isAdmin } = useAuth();
  const { permissions } = useMyPermissions();

  const can = (k?: PermissionKey) => !k || isAdmin || permissions.has(k);

  const items = TAB_IDS.map((id) => RAIL_ITEMS.find((r) => r.id === id)).filter(
    (i): i is (typeof RAIL_ITEMS)[number] =>
      !!i && can(i.perm) && (!i.adminOnly || isAdmin),
  );

  if (items.length === 0) return null;

  return (
    <nav className="hidden items-center gap-0.5 md:flex" aria-label="Modules">
      {items.map((it) => {
        const active = it.matches.some(
          (m) => loc.pathname === m || loc.pathname.startsWith(m + "/"),
        );
        return (
          <Link
            key={it.id}
            to={it.to as never}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {t(`shell.rail.${it.labelKey}`)}
          </Link>
        );
      })}
    </nav>
  );
}
