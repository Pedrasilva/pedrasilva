import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2,
  Shield,
  Upload,
  FolderKanban,
  Calculator,
  CalendarCheck,
  Utensils,
  Wallet,
  Users,
  Settings,
  Database,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminHubPage,
});

type AdminLink = {
  to: string;
  label: string;
  description: string;
  icon: typeof Shield;
};

type AdminGroup = {
  title: string;
  description?: string;
  links: AdminLink[];
};

const GROUPS: AdminGroup[] = [
  {
    title: uiI18n.t("common:shell.link.settings.company"),
    description: uiI18n.t("access:batchFive.labels.taxDetailsSharedByFinanceOcrAnd"),
    links: [
      {
        to: "/admin/company-settings",
        label: uiI18n.t("access:batchFive.labels.companyTaxSettings"),
        description:
          uiI18n.t("access:batchFive.labels.nameTaxIdVatAndInvoicingSettings"),
        icon: Building2,
      },
      {
        to: "/finance",
        label: uiI18n.t("access:batchFive.labels.suppliersAndClientsMasterData"),
        description:
          uiI18n.t("access:batchFive.labels.canonicalCompanyRegisterSharedByFinanceProjects"),
        icon: Users,
      },
    ],
  },
  {
    title: uiI18n.t("access:batchFive.labels.accountsAndPermissions"),
    links: [
      {
        to: "/admin/permissions",
        label: uiI18n.t("access:batchFive.labels.permissionsV"),
        description:
          uiI18n.t("access:batchFive.labels.baseRolesAndIndividualGrantsRevocationsPer"),
        icon: Shield,
      },
      {
        to: "/admin/access",
        label: uiI18n.t("access:batchFive.labels.accessPreview"),
        description:
          uiI18n.t("access:batchFive.labels.newAccessCatalogueAndTargetLevelsPer"),
        icon: Shield,
      },
      {
        to: "/admin/cost-rates",
        label: uiI18n.t("access:batchFive.labels.lockedHourlyCosts"),
        description:
          uiI18n.t("access:batchFive.labels.costPeriodsPerPersonHistoricalBackfillAnd"),
        icon: Shield,
      },
      {
        to: "/hr/admin",
        label: uiI18n.t("access:batchFive.labels.permissionsAndHrAdministration"),
        description:
          uiI18n.t("access:batchFive.labels.permissionsMatrixPendingCollaboratorsAndHrAdministration"),
        icon: Shield,
      },
    ],
  },
  {
    title: uiI18n.t("access:batchFive.labels.hrSettings"),
    links: [
      {
        to: "/admin/calendar",
        label: uiI18n.t("access:batchFive.labels.studioCalendar"),
        description: uiI18n.t("access:batchFive.labels.publicHolidaysStudioClosuresMandatoryVacationAnd"),
        icon: CalendarCheck,
      },
      {
        to: "/hr/dias-uteis",
        label: uiI18n.t("common:shell.link.settings.workingDays"),
        description: uiI18n.t("access:batchFive.labels.workingDayAndPublicHolidayCalendarUsed"),
        icon: CalendarCheck,
      },
      {
        to: "/hr/valor-bo",
        label: uiI18n.t("common:shell.link.settings.boValue"),
        description: uiI18n.t("access:batchFive.labels.hourlyBackofficeValueUsedInInternalAllocations"),
        icon: Calculator,
      },
      {
        to: "/hr/subsidio-alimentacao",
        label: uiI18n.t("common:shell.link.settings.mealAllowance"),
        description: uiI18n.t("access:batchFive.labels.mealAllowanceTableAndRules"),
        icon: Utensils,
      },
      {
        to: "/hr/beneficios",
        label: uiI18n.t("glossary:hr.benefits"),
        description: uiI18n.t("access:batchFive.labels.hrBenefitsReceiptSettingsAndAdministration"),
        icon: Wallet,
      },
    ],
  },
  {
    title: uiI18n.t("access:batchFive.labels.commercialCatalogues"),
    description: uiI18n.t("access:batchFive.labels.listsSharedByCollaboratorSheetsAndQuote"),
    links: [
      {
        to: "/admin/proposal-roles",
        label: uiI18n.t("access:batchFive.labels.commercialTitlesRoles"),
        description:
          uiI18n.t("access:batchFive.labels.juniorArchitectArchitectSeniorArchitectPartnerProject"),
        icon: Users,
      },
      {
        to: "/admin/proposal-images",
        label: uiI18n.t("access:batchFive.labels.imageLibraryProposals"),
        description:
          uiI18n.t("access:batchFive.labels.sharedStudioImagesUsedInPsaProposal"),
        icon: Upload,
      },
    ],
  },
  {

    title: uiI18n.t("access:batchFive.labels.systemTools"),
    links: [
      {
        to: "/admin/imports",
        label: uiI18n.t("common:admin.imports.title"),
        description: uiI18n.t("access:batchFive.labels.dataImportsDriveSynchronizationAndBackfills"),
        icon: Upload,
      },
      {
        to: "/admin/backups",
        label: uiI18n.t("access:batchFive.labels.backupsGoogleDrive"),
        description:
          uiI18n.t("access:batchFive.labels.automaticDailyAndWeeklyBackupsAndManual"),
        icon: Database,
      },
      {
        to: "/admin/quotes-trash",
        label: uiI18n.t("access:batchFive.labels.quoteRecovery"),
        description:
          uiI18n.t("access:batchFive.labels.restoreDeletedOrArchivedQuotesDeletedQuotes"),
        icon: Trash2,
      },
      {
        to: "/admin/projects",
        label: uiI18n.t("access:batchFive.labels.projectsAdmin"),
        description: uiI18n.t("access:batchFive.labels.projectAdministrationAndIntegrityTools"),
        icon: FolderKanban,
      },
      {
        to: "/hr",
        label: uiI18n.t("common:shell.link.hr.collaborators"),
        description: uiI18n.t("access:batchFive.labels.teamCollaboratorManagement"),
        icon: Users,
      },
    ],
  },
];

function AdminHubPage() {
  useTranslation();
  return (
    <AdminOnly>
      <div className="mx-auto max-w-6xl space-y-8 p-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Settings className="h-6 w-6" />  {uiI18n.t("common:administration")} </h1>
          <p className="text-sm text-muted-foreground">
             {uiI18n.t("access:batchFive.labels.companyHrFinancePermissionAndSystemSettings")} </p>
        </div>

        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h2>
              {group.description && (
                <p className="text-xs text-muted-foreground">{group.description}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.links.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="group block focus:outline-none"
                  >
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/30">
                      <CardHeader className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <CardTitle className="text-base">{link.label}</CardTitle>
                        </div>
                        <CardDescription className="text-xs leading-relaxed">
                          {link.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <span className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                           {uiI18n.t("access:batchFive.labels.open")} </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </AdminOnly>
  );
}
