import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";
import {
  Users,
  BarChart3,
  Calculator,
  CalendarDays,
  CalendarCheck,
  Wallet,
  Shield,
  User as UserIcon,
  Utensils,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_app/hr")({
  component: HrLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
  show: boolean;
};

type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
};

function HrLayout() {
  const { t } = useTranslation("hr");
  const loc = useLocation();
  const { isAdmin, isRealAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const [collapsed, setCollapsed] = useState(false);

  const can = (key: PermissionKey) => isAdmin || permissions.has(key);

  const groups = useMemo<NavGroup[]>(
    () => [
      {
        key: "pessoas",
        label: t("sidebar.groups.people"),
        items: [
          {
            to: "/hr/minha-ficha",
            label: t("nav.myProfile"),
            icon: UserIcon,
            match: (p) => p.startsWith("/hr/minha-ficha"),
            show: can("hr.minha-ficha"),
          },
          {
            to: "/hr/colaboradores",
            label: t("nav.collaborators"),
            icon: Users,
            match: (p) =>
              p === "/hr" ||
              p.startsWith("/hr/colaboradores") ||
              p.startsWith("/hr/colaborador"),
            show: can("hr.colaboradores"),
          },
          {
            to: "/hr/ferias",
            label: t("nav.vacation"),
            icon: CalendarDays,
            match: (p) => p.startsWith("/hr/ferias"),
            show: can("hr.ferias.own"),
          },
        ],
      },
      {
        key: "compensacao",
        label: t("sidebar.groups.compensation"),
        items: [
          {
            to: "/hr/resumo",
            label: t("nav.summary"),
            icon: BarChart3,
            match: (p) => p.startsWith("/hr/resumo"),
            show: isRealAdmin || can("hr.resumo"),
          },
          {
            to: "/hr/beneficios",
            label: t("nav.benefits"),
            icon: Wallet,
            match: (p) => p.startsWith("/hr/beneficios"),
            show: can("hr.beneficios.own"),
          },
          {
            to: "/hr/subsidio-alimentacao",
            label: t("nav.mealAllowance"),
            icon: Utensils,
            match: (p) => p.startsWith("/hr/subsidio-alimentacao"),
            show: isRealAdmin || can("hr.subsidio-alimentacao"),
          },
        ],
      },
      {
        key: "configuracao",
        label: t("sidebar.groups.configuration"),
        items: [
          {
            to: "/hr/dias-uteis",
            label: t("nav.workingDays"),
            icon: CalendarCheck,
            match: (p) => p.startsWith("/hr/dias-uteis"),
            show: isRealAdmin || can("hr.dias-uteis"),
          },
          {
            to: "/hr/valor-bo",
            label: t("nav.boRate"),
            icon: Calculator,
            match: (p) => p.startsWith("/hr/valor-bo"),
            show: isRealAdmin || can("hr.valor-bo"),
          },
          {
            to: "/hr/admin",
            label: t("nav.permissions"),
            icon: Shield,
            match: (p) => p.startsWith("/hr/admin"),
            show: isRealAdmin,
          },
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, isRealAdmin, permissions, t],
  );

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] bg-[var(--hr-bg)]">
      {/* Sidebar — desktop */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-[var(--hr-bg)] transition-[width] duration-200 ease-out",
          collapsed ? "w-[68px]" : "w-[240px]",
        )}
      >
        <div
          className={cn(
            "flex items-center px-4 py-5",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed && (
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("sidebar.title")}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1 rounded-md"
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          <div className="flex flex-col gap-7">
            {visibleGroups.map((group) => (
              <div key={group.key} className="flex flex-col gap-1.5">
                {!collapsed && (
                  <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                    {group.label}
                  </span>
                )}
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.match(loc.pathname);
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "group flex items-center gap-3 rounded-md text-sm font-medium transition-colors",
                            collapsed
                              ? "justify-center px-0 py-2"
                              : "px-2.5 py-2",
                            active
                              ? "bg-card text-foreground shadow-[0_2px_8px_var(--hr-shadow)] ring-1 ring-border/60"
                              : "text-muted-foreground hover:text-foreground hover:bg-card/60",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-colors",
                              active
                                ? "text-[var(--hr-accent)]"
                                : "text-muted-foreground group-hover:text-foreground",
                            )}
                          />
                          {!collapsed && (
                            <span className="truncate">{item.label}</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Mobile: tira horizontal scrollable de atalhos */}
      <div className="md:hidden border-b border-border bg-[var(--hr-bg)] sticky top-14 z-30">
        <div className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-thin">
          {visibleGroups.flatMap((g) => g.items).map((item) => {
            const Icon = item.icon;
            const active = item.match(loc.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-card text-foreground ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Conteúdo */}
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
