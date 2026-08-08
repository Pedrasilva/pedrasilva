import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Inbox as InboxIcon, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxLayout,
});

function InboxLayout() {
  const { t } = useTranslation(["inbox", "common"]);
  const loc = useLocation();
  const { isAdmin, loading } = useAuth();
  const { permissions, loading: permsLoading } = useMyPermissions();

  const allowed = isAdmin || permissions.has("inbox.triage");

  if (loading || permsLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {t("common:loading")}
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {t("inbox:settings.adminOnly")}
      </div>
    );
  }

  const tabs = [
    { to: "/inbox", label: t("inbox:nav.triage"), icon: InboxIcon, exact: true },
    { to: "/inbox/settings", label: t("inbox:nav.settings"), icon: Settings, exact: false },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          {t("inbox:page.kicker")}
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          {t("inbox:page.title")}
        </h1>
      </div>

      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => {
          const active = tab.exact
            ? loc.pathname === tab.to || loc.pathname === `${tab.to}/`
            : loc.pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm",
                active
                  ? "border-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
