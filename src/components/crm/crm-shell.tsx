import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Building2, Users, GitBranch, LayoutDashboard, Target, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

export function CrmShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const { t } = useTranslation("crm");

  const tabs = [
    { to: "/crm" as const, label: t("shell.tabs.overview"), icon: LayoutDashboard, match: (p: string) => p === "/crm" },
    { to: "/crm/opportunities" as const, label: t("shell.tabs.opportunities"), icon: Target, match: (p: string) => p.startsWith("/crm/opportunities") || p.startsWith("/crm/quotes") },
    { to: "/crm/accounts" as const, label: t("shell.tabs.accounts"), icon: Receipt, match: (p: string) => p.startsWith("/crm/accounts") },
    { to: "/crm/companies" as const, label: t("shell.tabs.companies"), icon: Building2, match: (p: string) => p.startsWith("/crm/companies") },
    { to: "/crm/contacts" as const, label: t("shell.tabs.contacts"), icon: Users, match: (p: string) => p.startsWith("/crm/contacts") },
    { to: "/crm/pipeline" as const, label: t("shell.tabs.pipelineLegacy"), icon: GitBranch, match: (p: string) => p.startsWith("/crm/pipeline") },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> {t("shell.backToHub")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" /> {t("shell.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("shell.subtitle")}</p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1 border-b pt-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.match(loc.pathname);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-3 py-2 -mb-px text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
