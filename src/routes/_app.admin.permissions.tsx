import { translateError } from '@/lib/translate-error';
import uiI18n from "@/i18n/index";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from '@/lib/toast';
import { AdminOnly } from "@/components/AdminOnly";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Minus, Plus, ShieldCheck, X } from "lucide-react";
import {
  ALL_ROLES,
  MODULES,
  PERMISSION_BY_KEY,
  PERMISSION_CATALOGUE,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  SCOPE_RANK,
  type PermissionScope,
  type PmRole,
  type V2PermissionKey,
} from "@/lib/permissions-v2";


const catalogueLabels: Record<string, string> = {"Projects":"access:permissions.catalogue.projects","Edit weekly notes":"access:permissions.catalogue.editWeeklyNotes","Edit project notes and read/edit confidential week notes; no planning or financial access.":"access:permissions.catalogue.editProjectNotesAndReadEditConfidentialWeekNotesNoPlanningOrFinancialAccess","View projects":"access:permissions.catalogue.viewProjects","List and open project details.":"access:permissions.catalogue.listAndOpenProjectDetails","Edit planning":"access:permissions.catalogue.editPlanning","Create/move allocations, stages, and dependencies.":"access:permissions.catalogue.createMoveAllocationsStagesAndDependencies","Edit stages":"access:permissions.catalogue.editStages","Add, rename, baseline and reorder project stages.":"access:permissions.catalogue.addRenameBaselineAndReorderProjectStages","View project financials":"access:permissions.catalogue.viewProjectFinancials","Revenue, cost, budget, and invoicing on the project page.":"access:permissions.catalogue.revenueCostBudgetAndInvoicingOnTheProjectPage","View project margins":"access:permissions.catalogue.viewProjectMargins","Profit and margin % per stage and project.":"access:permissions.catalogue.profitAndMarginPerStageAndProject","Scheduling":"access:permissions.catalogue.scheduling","View Gantt":"access:permissions.catalogue.viewGantt","Open the global Gantt and per-project Gantt.":"access:permissions.catalogue.openTheGlobalGanttAndPerProjectGantt","View team allocations":"access:permissions.catalogue.viewTeamAllocations","See workload and bookings of other people.":"access:permissions.catalogue.seeWorkloadAndBookingsOfOtherPeople","Edit allocations":"access:permissions.catalogue.editAllocations","Move, add, remove allocations and toggle tentative/committed.":"access:permissions.catalogue.moveAddRemoveAllocationsAndToggleTentativeCommitted","Timesheets":"access:permissions.catalogue.timesheet73","Log own time":"access:permissions.catalogue.logOwnTime","Submit your own timesheet entries.":"access:permissions.catalogue.submitYourOwnTimesheetEntries","View team timesheets":"access:permissions.catalogue.viewTeamTimesheets","See entries of other people.":"access:permissions.catalogue.seeEntriesOfOtherPeople","Approve timesheets":"access:permissions.catalogue.approveTimesheets","Mark team timesheets as approved.":"access:permissions.catalogue.markTeamTimesheetsAsApproved","Financials":"access:permissions.catalogue.financials","View financial dashboard":"access:permissions.catalogue.viewFinancialDashboard","Cross-project revenue, cost and profit indicators.":"access:permissions.catalogue.crossProjectRevenueCostAndProfitIndicators","View rates & costs":"access:permissions.catalogue.viewRatesCosts","Internal hourly costs, sale rates and rate overrides.":"access:permissions.catalogue.internalHourlyCostsSaleRatesAndRateOverrides","CRM":"access:permissions.catalogue.crm","View companies":"access:permissions.catalogue.viewCompanies","Client, supplier and prospect records (legacy crm.companies).":"access:permissions.catalogue.clientSupplierAndProspectRecordsLegacyCrmCompanies","Edit companies":"access:permissions.catalogue.editCompanies","Create and update company records.":"access:permissions.catalogue.createAndUpdateCompanyRecords","View contacts":"access:permissions.catalogue.viewContacts","Contact directory (legacy crm.contacts).":"access:permissions.catalogue.contactDirectoryLegacyCrmContacts","Edit contacts":"access:permissions.catalogue.editContacts","Create and update contacts.":"access:permissions.catalogue.createAndUpdateContacts","View pipeline & proposals":"access:permissions.catalogue.viewPipelineProposals","Opportunities, quotes and fee proposals (legacy crm.pipeline).":"access:permissions.catalogue.opportunitiesQuotesAndFeeProposalsLegacyCrmPipeline","Edit pipeline":"access:permissions.catalogue.editPipeline","Move opportunity stages, edit proposals and outcomes.":"access:permissions.catalogue.moveOpportunityStagesEditProposalsAndOutcomes","Manage quotes & templates":"access:permissions.catalogue.manageQuotesTemplates","Build quotes, templates and convert them to projects.":"access:permissions.catalogue.buildQuotesTemplatesAndConvertThemToProjects","HR":"access:permissions.catalogue.hr","View own HR record":"access:permissions.catalogue.viewOwnHRRecord","Own payslip snapshot, working days and personal data.":"access:permissions.catalogue.ownPayslipSnapshotWorkingDaysAndPersonalData","View collaborator list":"access:permissions.catalogue.viewCollaboratorList","People directory without opening individual records.":"access:permissions.catalogue.peopleDirectoryWithoutOpeningIndividualRecords","Open collaborator record":"access:permissions.catalogue.openCollaboratorRecord","Individual HR record, excluding compensation values.":"access:permissions.catalogue.individualHRRecordExcludingCompensationValues","Edit collaborator record":"access:permissions.catalogue.editCollaboratorRecord","Update contracts, capacity and personal HR data.":"access:permissions.catalogue.updateContractsCapacityAndPersonalHRData","View compensation":"access:permissions.catalogue.viewCompensation","Salary snapshots, net/gross, benefits balances and comparison summary values.":"access:permissions.catalogue.salarySnapshotsNetGrossBenefitsBalancesAndComparisonSummaryValues","Submit own benefit expenses":"access:permissions.catalogue.submitOwnBenefitExpenses","Upload receipts and consult own benefit balance.":"access:permissions.catalogue.uploadReceiptsAndConsultOwnBenefitBalance","Approve benefit expenses":"access:permissions.catalogue.approveBenefitExpenses","Approve or reject other collaborators' benefit expenses.":"access:permissions.catalogue.approveOrRejectOtherCollaboratorsBenefitExpenses","Request own leave":"access:permissions.catalogue.requestOwnLeave","Submit and track own vacation requests.":"access:permissions.catalogue.submitAndTrackOwnVacationRequests","Approve leave":"access:permissions.catalogue.approveLeave","Approve or reject vacation requests of others.":"access:permissions.catalogue.approveOrRejectVacationRequestsOfOthers","HR administration":"access:permissions.catalogue.hr2061646d696e697374726174696f6e","Permission matrix, meal allowance table, backoffice hourly value and HR configuration.":"access:permissions.catalogue.permissionMatrixMealAllowanceTableBackofficeHourlyValueAndHRConfiguration","Finance":"access:permissions.catalogue.finance","View finance dashboard":"access:permissions.catalogue.viewFinanceDashboard","Office cash flow, income and expense indicators (legacy finance.dashboard).":"access:permissions.catalogue.officeCashFlowIncomeAndExpenseIndicatorsLegacyFinanceDashboard","View financial documents":"access:permissions.catalogue.viewFinancialDocuments","Invoices, credit notes and receipts, issued and received.":"access:permissions.catalogue.invoicesCreditNotesAndReceiptsIssuedAndReceived","Edit financial documents":"access:permissions.catalogue.editFinancialDocuments","Create, edit and settle documents, expenses and payments.":"access:permissions.catalogue.createEditAndSettleDocumentsExpensesAndPayments","View banking":"access:permissions.catalogue.viewBanking","Bank accounts, balances and transactions.":"access:permissions.catalogue.bankAccountsBalancesAndTransactions","Manage banking":"access:permissions.catalogue.manageBanking","Import statements, classify and reconcile transactions.":"access:permissions.catalogue.importStatementsClassifyAndReconcileTransactions","View finance reports":"access:permissions.catalogue.viewFinanceReports","Cash flow, VAT, forecast and per-project financial reports.":"access:permissions.catalogue.cashFlowVATForecastAndPerProjectFinancialReports","Manage finance settings":"access:permissions.catalogue.manageFinanceSettings","Classifications, VAT rates, classification rules and imports.":"access:permissions.catalogue.classificationsVATRatesClassificationRulesAndImports","Inventory":"access:permissions.catalogue.inventory","View asset register":"access:permissions.catalogue.viewAssetRegister","Open the Inventory module (assets, assignments, reports).":"access:permissions.catalogue.openTheInventoryModuleAssetsAssignmentsReports","Products":"access:permissions.catalogue.products","View product library":"access:permissions.catalogue.viewProductLibrary","Open the Product Library and project schedules.":"access:permissions.catalogue.openTheProductLibraryAndProjectSchedules","Edit product library":"access:permissions.catalogue.editProductLibrary","Create, edit, archive and categorise Product Library items.":"access:permissions.catalogue.createEditArchiveAndCategoriseProductLibraryItems","Portfolio":"access:permissions.catalogue.portfolio","View portfolio":"access:permissions.catalogue.viewPortfolio","Open the studio portfolio.":"access:permissions.catalogue.openTheStudioPortfolio","Marketing":"access:permissions.catalogue.marketing","Contribute to marketing":"access:permissions.catalogue.contributeToMarketing","Create marketing captures from inside the Hub.":"access:permissions.catalogue.createMarketingCapturesFromInsideTheHub","View marketing captures":"access:permissions.catalogue.viewMarketingCaptures","own = only captures I created; all = every capture.":"access:permissions.catalogue.ownOnlyCapturesICreatedAllEveryCapture","Curate marketing captures":"access:permissions.catalogue.curateMarketingCaptures","Edit curation fields, status and clearance of any capture.":"access:permissions.catalogue.editCurationFieldsStatusAndClearanceOfAnyCapture","Edit marketing strategy":"access:permissions.catalogue.editMarketingStrategy","Reserved for a later pass (Marketing Bible).":"access:permissions.catalogue.reservedForALaterPassMarketingBible","Reports":"access:permissions.catalogue.reports","View reports":"access:permissions.catalogue.viewReports","Open the Reports module (hours logged and other studio reports).":"access:permissions.catalogue.openTheReportsModuleHoursLoggedAndOtherStudioReports"};
const displayPermission = (value: string) => uiI18n.t(catalogueLabels[value] ?? value);

export const Route = createFileRoute("/_app/admin/permissions")({
  head: () => ({ meta: [
    { title: "Permissões da equipa | PSA Hub" },
    { name: "description", content: "Gerir permissões e autorizações individuais da equipa PSA Hub." },
    { property: "og:title", content: "Permissões da equipa | PSA Hub" },
    { property: "og:description", content: "Gerir permissões e autorizações individuais da equipa PSA Hub." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminPermissionsPage,
});

interface UserRow {
  user_id: string;
  email: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
  collaborator_id: string | null;
  collaborator_nome: string | null;
  assigned_roles: PmRole[] | null;
}

interface OverrideRow {
  id: string;
  user_id: string;
  permission_key: string;
  scope: string;
  granted: boolean;
}

interface RolePermRow {
  role: PmRole;
  permission_key: string;
  scope: string;
}

const SCOPES: PermissionScope[] = ["own", "assigned", "team", "department", "all"];
const SCOPE_LABEL: Record<PermissionScope, string> = {
  own: "Próprio",
  assigned: "Atribuído",
  team: "Equipa",
  department: "Departamento",
  all: "Tudo",
};

function AdminPermissionsPage() {
  useTranslation();
  return (
    <AdminOnly>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6" />  {uiI18n.t("access:batchFive.labels.permissionsV")} </h1>
          <p className="text-sm text-muted-foreground">
             {uiI18n.t("access:batchFive.labels.baseRolesWithIndividualGrantsAndRevocations")} </p>
        </div>
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users"> {uiI18n.t("access:batchFive.labels.byAccount")} </TabsTrigger>
            <TabsTrigger value="roles"> {uiI18n.t("access:batchFive.labels.baseRoles")} </TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
          <TabsContent value="roles" className="mt-4">
            <RolesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminOnly>
  );
}

function useRolePermissions() {
  return useQuery({
    queryKey: ["admin-role-permissions"],
    queryFn: async (): Promise<RolePermRow[]> => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, permission_key, scope");
      if (error) throw error;
      return (data ?? []) as RolePermRow[];
    },
  });
}

function UsersTab() {
  const { t } = useTranslation("projects");
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newKey, setNewKey] = useState<V2PermissionKey | "">("");
  const [newScope, setNewScope] = useState<PermissionScope>("assigned");

  const usersQuery = useQuery({
    queryKey: ["admin-users-v2"],
    queryFn: async (): Promise<UserRow[]> => {
      const { data, error } = await supabase.rpc("list_users_with_role_v2");
      if (error) throw error;
      return (data ?? []) as unknown as UserRow[];
    },
  });

  const rolePerms = useRolePermissions();

  const overridesQuery = useQuery({
    queryKey: ["admin-user-overrides", selected],
    enabled: !!selected,
    queryFn: async (): Promise<OverrideRow[]> => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("id, user_id, permission_key, scope, granted")
        .eq("user_id", selected!);
      if (error) throw error;
      return (data ?? []) as OverrideRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: {
      key: string;
      scope: string;
      granted: boolean;
    }) => {
      const { error } = await supabase.from("user_permissions").upsert(
        {
          user_id: selected!,
          permission_key: input.key,
          scope: input.scope,
          granted: input.granted,
        },
        { onConflict: "user_id,permission_key,scope" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("access:batchFive.labels.permissionUpdated"));
      queryClient.invalidateQueries({ queryKey: ["admin-user-overrides", selected] });
      queryClient.invalidateQueries({ queryKey: ["my-effective-permissions"] });
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_permissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("access:batchFive.labels.exceptionRemoved"));
      queryClient.invalidateQueries({ queryKey: ["admin-user-overrides", selected] });
      queryClient.invalidateQueries({ queryKey: ["my-effective-permissions"] });
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
  });

  const users = usersQuery.data ?? [];
  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.collaborator_nome ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  });
  const user = users.find((u) => u.user_id === selected) ?? null;

  const baseline = useMemo(() => {
    if (!user) return [] as RolePermRow[];
    const roles = user.assigned_roles ?? [];
    return (rolePerms.data ?? []).filter((rp) => roles.includes(rp.role));
  }, [rolePerms.data, user]);

  const overrides = overridesQuery.data ?? [];
  const knownOverrides = overrides.filter((o) => PERMISSION_BY_KEY.has(o.permission_key as V2PermissionKey));
  const legacyOverrides = overrides.filter((o) => !PERMISSION_BY_KEY.has(o.permission_key as V2PermissionKey));

  const effective = useMemo(() => {
    const map = new Map<string, { key: string; scope: string; source: "role" | "override" }>();
    for (const b of baseline) map.set(`${b.permission_key}|${b.scope}`, { key: b.permission_key, scope: b.scope, source: "role" });
    for (const o of knownOverrides) {
      const id = `${o.permission_key}|${o.scope}`;
      if (o.granted) map.set(id, { key: o.permission_key, scope: o.scope, source: "override" });
      else map.delete(id);
    }
    return [...map.values()].sort(
      (a, b) =>
        a.key.localeCompare(b.key) ||
        SCOPE_RANK[b.scope as PermissionScope] - SCOPE_RANK[a.scope as PermissionScope],
    );
  }, [baseline, knownOverrides]);

  const scopeOptions = newKey ? PERMISSION_BY_KEY.get(newKey)!.scopes : SCOPES;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base"> {uiI18n.t("common:users")} </CardTitle>
          <CardDescription>{users.length}  {uiI18n.t("access:batchFive.labels.accounts")} </CardDescription>
          <Input
            placeholder={uiI18n.t("common:searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2"
          />
        </CardHeader>
        <CardContent className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
          {usersQuery.isLoading && (
            <p className="p-2 text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </p>
          )}
          {filtered.map((u) => (
            <button
              key={u.user_id}
              onClick={() => setSelected(u.user_id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selected === u.user_id ? "bg-accent" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium">
                {u.collaborator_nome ?? u.email ?? u.user_id}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {u.is_admin && <Badge variant="destructive"> {uiI18n.t("glossary:permissions.roles.admin")} </Badge>}
                {(u.assigned_roles ?? []).map((r) => (
                  <Badge key={r} variant="secondary">
                    {uiI18n.t(`access:permissions.roles.${r}`) ?? r}
                  </Badge>
                ))}
                {!u.is_admin && (u.assigned_roles ?? []).length === 0 && (
                  <span> {uiI18n.t("access:batchFive.labels.noRole")} </span>
                )}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {!user && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
               {uiI18n.t("access:batchFive.labels.selectAnAccountToReviewEffectivePermissions")} </CardContent>
          </Card>
        )}

        {user && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {user.collaborator_nome ?? user.email}
                </CardTitle>
                <CardDescription>
                  {user.email} ·{" "}
                  {user.is_admin
                    ? uiI18n.t("access:batchFive.labels.administratorPassesAllChecks")
                    : (user.assigned_roles ?? []).map((r) => uiI18n.t(`access:permissions.roles.${r}`) ?? r).join(", ") ||
                      uiI18n.t("access:batchFive.labels.noRoleAssigned")}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base"> {uiI18n.t("access:batchFive.labels.addException")} </CardTitle>
                <CardDescription>
                   {uiI18n.t("access:batchFive.labels.additionalGrantOrRevocationOverTheBase")} </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-2">
                <div className="min-w-[280px] flex-1">
                  <Select
                    value={newKey}
                    onValueChange={(v) => {
                      const key = v as V2PermissionKey;
                      setNewKey(key);
                      const def = PERMISSION_BY_KEY.get(key);
                      if (def && !def.scopes.includes(newScope)) setNewScope(def.scopes[0]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={uiI18n.t("access:batchFive.labels.permission")} />
                    </SelectTrigger>
                    <SelectContent>
                      {MODULES.map((m) => (
                        <div key={m}>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                            {displayPermission(m)}
                          </div>
                          {PERMISSION_CATALOGUE.filter((p) => p.module === m).map((p) => (
                            <SelectItem key={p.key} value={p.key}>
                              {p.key === "projects.edit_week_notes" ? t("weekNotes.editPermission") : displayPermission(p.label)}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select
                  value={newScope}
                  onValueChange={(v) => setNewScope(v as PermissionScope)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {uiI18n.t(`access:permissions.scopes.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!newKey || upsert.isPending}
                  onClick={() =>
                    upsert.mutate({ key: newKey, scope: newScope, granted: true })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />  {uiI18n.t("access:batchFive.labels.grant")} </Button>
                <Button
                  variant="outline"
                  disabled={!newKey || upsert.isPending}
                  onClick={() =>
                    upsert.mutate({ key: newKey, scope: newScope, granted: false })
                  }
                >
                  <Minus className="mr-1 h-4 w-4" />  {uiI18n.t("access:batchFive.labels.revoke")} </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base"> {uiI18n.t("access:batchFive.labels.individualExceptions")} </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {overrides.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                     {uiI18n.t("access:batchFive.labels.noExceptionsTheAccountOnlyHasThe")} </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead> {uiI18n.t("common:permission")} </TableHead>
                        <TableHead> {uiI18n.t("glossary:permissions.scopesLabel")} </TableHead>
                        <TableHead> {uiI18n.t("common:type")} </TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...knownOverrides, ...legacyOverrides].map((o) => {
                        const def = PERMISSION_BY_KEY.get(o.permission_key as V2PermissionKey);
                        return (
                          <TableRow key={o.id}>
                            <TableCell>
                              <div className="font-medium">{o.permission_key === "projects.edit_week_notes" ? t("weekNotes.editPermission") : def ? displayPermission(def.label) : o.permission_key}</div>
                              <div className="text-xs text-muted-foreground">
                                {o.permission_key}
                                {!def && uiI18n.t("access:batchFive.labels.legacy")}
                              </div>
                            </TableCell>
                            <TableCell>
                              {uiI18n.t(`access:permissions.scopes.${o.scope as PermissionScope}`) ?? o.scope}
                            </TableCell>
                            <TableCell>
                              {o.granted ? (
                                <Badge variant="secondary">
                                  <Check className="mr-1 h-3 w-3" />  {uiI18n.t("access:batchFive.labels.granted")} </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <X className="mr-1 h-3 w-3" />  {uiI18n.t("access:batchFive.labels.revoked")} </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => remove.mutate(o.id)}
                              >
                                 {uiI18n.t("common:remove")} </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base"> {uiI18n.t("access:batchFive.labels.effectivePermissions")} </CardTitle>
                <CardDescription>
                  {user.is_admin
                    ? uiI18n.t("access:batchFive.labels.administratorFullAccessRegardlessOfTheList")
                    : uiI18n.t("access:batchFive.labels.baseRoleWithIndividualExceptionsApplied")}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead> {uiI18n.t("common:permission")} </TableHead>
                      <TableHead> {uiI18n.t("glossary:permissions.scopesLabel")} </TableHead>
                      <TableHead> {uiI18n.t("hr:myProfile.details.fields.source")} </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {effective.map((e) => {
                      const def = PERMISSION_BY_KEY.get(e.key as V2PermissionKey);
                      return (
                        <TableRow key={`${e.key}|${e.scope}`}>
                          <TableCell>
                            <div className="font-medium">{e.key === "projects.edit_week_notes" ? t("weekNotes.editPermission") : def ? displayPermission(def.label) : e.key}</div>
                            <div className="text-xs text-muted-foreground">{e.key}</div>
                          </TableCell>
                          <TableCell>
                            {uiI18n.t(`access:permissions.scopes.${e.scope as PermissionScope}`) ?? e.scope}
                          </TableCell>
                          <TableCell>
                            <Badge variant={e.source === "role" ? "outline" : "secondary"}>
                              {e.source === "role" ? uiI18n.t("common:role") : uiI18n.t("access:batchFive.labels.exception")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {effective.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground">
                           {uiI18n.t("access:batchFive.labels.noEffectivePermissions")} </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function RolesTab() {
  const { t } = useTranslation("projects");
  const rolePerms = useRolePermissions();
  const rows = rolePerms.data ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ALL_ROLES.map((role) => {
        const perms = rows
          .filter((r) => r.role === role)
          .sort((a, b) => a.permission_key.localeCompare(b.permission_key));
        return (
          <Card key={role}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{uiI18n.t(`access:permissions.roles.${role}`)}</CardTitle>
              <CardDescription>{ROLE_DESCRIPTION[role]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {role === "admin" && (
                <p className="text-sm text-muted-foreground">
                   {uiI18n.t("access:batchFive.labels.fullAccessIndependentOfThisTable")} </p>
              )}
              {perms.length === 0 && role !== "admin" && (
                <p className="text-sm text-muted-foreground"> {uiI18n.t("access:batchFive.labels.noBasePermissions")} </p>
              )}
              {perms.map((p) => {
                const def = PERMISSION_BY_KEY.get(p.permission_key as V2PermissionKey);
                return (
                  <div
                    key={`${p.permission_key}|${p.scope}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>{p.permission_key === "projects.edit_week_notes" ? t("weekNotes.editPermission") : def ? displayPermission(def.label) : p.permission_key}</span>
                    <Badge variant="outline">
                      {uiI18n.t(`access:permissions.scopes.${p.scope as PermissionScope}`) ?? p.scope}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
