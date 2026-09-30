import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { useFinanceAccess } from "@/hooks/use-finance-access";
import type { PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { RAIL_ITEMS, type FlyoutLink } from "./nav-config";
import { usePendingQuestions } from "./AppRail";

/**
 * In-module tab strip built from the module's rail flyout links, with the
 * same permission filtering as the flyout. Module root matches exactly;
 * other tabs match by prefix.
 */
export function ModuleSubnav({ moduleId }: { moduleId: string }) {
  const { t } = useTranslation("common");
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const { can: canV2 } = useMyPermissionsV2();
  const { hasAccess: hasFinance } = useFinanceAccess();
  const item = RAIL_ITEMS.find((i) => i.moduleId === moduleId);
  if (!item) return null;
  const can = (key?: PermissionKey) => !key || isAdmin || permissions.has(key);
  const canLink = (l: FlyoutLink) =>
    (!l.requiresFinance || hasFinance) &&
    can(l.perm) &&
    (!l.permV2 || isAdmin || canV2(l.permV2, l.permV2Scope ?? "team"));
  const links = item.flyout.flatMap((s) => s.links).filter(canLink);
  const isActive = (to: string) =>
    to === item.to ? pathname === to || pathname === to + "/" : pathname === to || pathname.startsWith(to + "/");

  return (
    <nav aria-label={t("shell.subnavLabel")} className="-mx-1 overflow-x-auto border-b">
      <div className="flex w-max gap-1 px-1">
        {links.map((l) => (
          <SubnavTab key={l.to} link={l} active={isActive(l.to)} />
        ))}
      </div>
    </nav>
  );
}

function SubnavTab({ link, active }: { link: FlyoutLink; active: boolean }) {
  const { t } = useTranslation("common");
  const { data: pending = 0 } = usePendingQuestions(link.badge === "marketingQuestions");
  return (
    <Link
      to={link.to as never}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {t(`shell.tab.${link.labelKey}`, { defaultValue: t(`shell.link.${link.labelKey}`) })}
      {link.badge && pending > 0 && (
        <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{pending}</span>
      )}
    </Link>
  );
}
