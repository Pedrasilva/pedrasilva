import { Link, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Laptop, Plus, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { RequestWfhDialog } from "@/components/hr/wfh/request-wfh-dialog";

export const Route = createFileRoute("/_app/hr/trabalho-remoto")({
  component: () => (
    <PermissionGate permission="hr.ferias.own">
      <RemoteWorkLayout />
    </PermissionGate>
  ),
});

function RemoteWorkLayout() {
  const { t } = useTranslation("hr");
  const { isAdmin } = useAuth();
  const loc = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const tabs = [
    { to: "/hr/trabalho-remoto", label: t("remoteWork.tabs.requests"), exact: true },
    { to: "/hr/trabalho-remoto/historico", label: t("remoteWork.tabs.history") },
    { to: "/hr/trabalho-remoto/analytics", label: t("remoteWork.tabs.analytics") },
  ];

  const isActive = (to: string, exact?: boolean) =>
    exact ? loc.pathname === to : loc.pathname.startsWith(to);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Laptop className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">{t("remoteWork.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("remoteWork.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/hr/trabalho-remoto/definicoes">
                <Settings className="mr-1.5 h-3.5 w-3.5" />
                {t("remoteWork.settings")}
              </Link>
            </Button>
          )}
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("remoteWork.newRequest")}
          </Button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive(tab.to, tab.exact)
                ? "border-[var(--hr-accent)] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />

      <RequestWfhDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
