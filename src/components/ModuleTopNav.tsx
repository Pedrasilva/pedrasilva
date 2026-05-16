import { useLocation, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  User as UserIcon,
  CalendarDays,
  Users,
  Wallet,
  Target,
  Building2,
  Receipt,
  FileText,
} from "lucide-react";
import { GlobalTopNav as ProjectsTopNav } from "@/components/GlobalTopNav";

/**
 * Route-aware top navigation. Each module renders its own quick-links so the
 * user never sees shortcuts from another module (e.g. the projects Time/Tasks
 * pickers when browsing HR).
 */
export function ModuleTopNav() {
  const loc = useLocation();
  const segment = loc.pathname.split("/")[1] ?? "";

  switch (segment) {
    case "hr":
      return <HrTopNav />;
    case "crm":
      return <CrmTopNav />;
    case "finance":
      return <FinanceTopNav />;
    case "admin":
      return null; // admin has its own page-level nav
    case "projects":
    case "":
    default:
      // Home + projects keep the current global shortcuts (Time, Tasks, Schedule, +)
      return <ProjectsTopNav />;
  }
}

// ---------------------------------------------------------------------------
// Shared link button
// ---------------------------------------------------------------------------

function NavBtn({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5 px-2.5">
      <Link to={to as never}>
        <Icon className="h-4 w-4" />
        <span className="hidden lg:inline">{label}</span>
      </Link>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------

function HrTopNav() {
  const { t } = useTranslation("hr");
  const { isAdmin, isRealAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const can = (key: PermissionKey) => isAdmin || permissions.has(key);
  const asCollab = isRealAdmin && !isAdmin;
  const canOwn = (key: PermissionKey) => asCollab || can(key);

  return (
    <>
      {canOwn("hr.minha-ficha") && (
        <NavBtn to="/hr/minha-ficha" label={t("nav.myProfile")} icon={UserIcon} />
      )}
      {canOwn("hr.ferias.own") && (
        <NavBtn to="/hr/ferias" label={t("nav.vacation")} icon={CalendarDays} />
      )}
      {canOwn("hr.beneficios.own") && (
        <NavBtn to="/hr/beneficios" label={t("nav.benefits")} icon={Wallet} />
      )}
      {can("hr.colaboradores") && (
        <NavBtn to="/hr/colaboradores" label={t("nav.collaborators")} icon={Users} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

function CrmTopNav() {
  const { t } = useTranslation("crm");
  return (
    <>
      <NavBtn to="/crm/opportunities" label={t("shell.tabs.opportunities")} icon={Target} />
      <NavBtn to="/crm/companies" label={t("shell.tabs.companies")} icon={Building2} />
      <NavBtn to="/crm/contacts" label={t("shell.tabs.contacts")} icon={Users} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

function FinanceTopNav() {
  const { t } = useTranslation("finance");
  return (
    <>
      <NavBtn
        to="/finance/documents"
        label={t("tabsExtra.documents", { defaultValue: "Documents" })}
        icon={FileText}
      />
      <NavBtn
        to="/finance"
        label={t("page.title", { defaultValue: "Finance" })}
        icon={Receipt}
      />
    </>
  );
}
