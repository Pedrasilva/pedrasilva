import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  FINANCE_NAV_GROUPS,
  findActiveFinanceGroup,
  isFinanceItemActive,
} from "./finance-nav-config";

export function FinanceTopNav() {
  const { t } = useTranslation(["finance"]);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isRealAdmin } = useAuth();

  const groups = FINANCE_NAV_GROUPS.filter((g) => !g.adminOnly || isRealAdmin);
  const activeGroup = findActiveFinanceGroup(path, groups);

  return (
    <nav className="sticky top-[6.5rem] z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Row 1: Groups */}
      <div className="flex h-10 items-center gap-1 overflow-x-auto px-3 scrollbar-none">
        {groups.map((g) => {
          const isActive = g.key === activeGroup.key;
          const target = g.items[0]?.to ?? "/finance";
          return (
            <Link
              key={g.key}
              to={target as never}
              className={cn(
                "relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(g.labelKey)}
              {isActive && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Row 2: Items of active group */}
      {activeGroup.items.length > 1 && (
        <div className="flex h-11 items-center gap-1 overflow-x-auto border-t px-3 scrollbar-none">
          {activeGroup.items.map((it) => {
            const Icon = it.icon;
            const active = isFinanceItemActive(path, it.to, it.end);
            return (
              <Link
                key={it.to}
                to={it.to as never}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{t(it.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
