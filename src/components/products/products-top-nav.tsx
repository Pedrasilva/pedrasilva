import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const ITEMS: Array<{ to: string; labelKey: string; end?: boolean }> = [
  { to: "/products", labelKey: "common:projects", end: true },
  { to: "/products/library", labelKey: "common:library" },
  { to: "/products/categories", labelKey: "common:categories" },
];

export function ProductsTopNav() {
  useTranslation();
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav className="sticky top-14 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-11 items-center gap-1 overflow-x-auto px-3 scrollbar-none">
        {ITEMS.map((it) => {
          const active = it.end
            ? path === it.to || path.startsWith("/products/project")
            : path.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to as never}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {uiI18n.t(it.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
