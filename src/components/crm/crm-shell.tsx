import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Building2, Users, LayoutDashboard, Target } from "lucide-react";
import { cn } from "@/lib/utils";


export function CrmShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const { t } = useTranslation("crm");

  const tabs = [
    { to: "/crm" as const, label: t("shell.tabs.overview"), icon: LayoutDashboard, match: (p: string) => p === "/crm" },
    { to: "/crm/opportunities" as const, label: t("shell.tabs.opportunities"), icon: Target, match: (p: string) => p.startsWith("/crm/opportunities") || p.startsWith("/crm/quotes") },
    // Accounts tab retired — the billing-entity concept was never wired up in
    // finance; account_id links on quotes/projects stay untouched.
    { to: "/crm/companies" as const, label: t("shell.tabs.companies"), icon: Building2, match: (p: string) => p.startsWith("/crm/companies") },
    { to: "/crm/contacts" as const, label: t("shell.tabs.contacts"), icon: Users, match: (p: string) => p.startsWith("/crm/contacts") },
    // Legacy pipeline fully retired — /crm/pipeline now redirects to Opportunities.
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <nav className="flex flex-wrap items-center gap-1 border-b">

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
