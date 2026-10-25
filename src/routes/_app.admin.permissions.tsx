import uiI18n from "@/i18n/index";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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


const catalogueLabels: Record<string, string> = {"Projects":"access:permissions.catalogue.50726f6a65637473","Edit weekly notes":"access:permissions.catalogue.45646974207765656b6c79206e6f746573","Edit project notes and read/edit confidential week notes; no planning or financial access.":"access:permissions.catalogue.456469742070726f6a656374206e6f74657320616e6420726561642f6564697420636f6e666964656e7469616c207765656b206e6f7465733b206e6f20706c616e6e696e67206f722066696e616e6369616c206163636573732e","View projects":"access:permissions.catalogue.566965772070726f6a65637473","List and open project details.":"access:permissions.catalogue.4c69737420616e64206f70656e2070726f6a6563742064657461696c732e","Edit planning":"access:permissions.catalogue.4564697420706c616e6e696e67","Create/move allocations, stages, and dependencies.":"access:permissions.catalogue.4372656174652f6d6f766520616c6c6f636174696f6e732c207374616765732c20616e6420646570656e64656e636965732e","Edit stages":"access:permissions.catalogue.4564697420737461676573","Add, rename, baseline and reorder project stages.":"access:permissions.catalogue.4164642c2072656e616d652c20626173656c696e6520616e642072656f726465722070726f6a656374207374616765732e","View project financials":"access:permissions.catalogue.566965772070726f6a6563742066696e616e6369616c73","Revenue, cost, budget, and invoicing on the project page.":"access:permissions.catalogue.526576656e75652c20636f73742c206275646765742c20616e6420696e766f6963696e67206f6e207468652070726f6a65637420706167652e","View project margins":"access:permissions.catalogue.566965772070726f6a656374206d617267696e73","Profit and margin % per stage and project.":"access:permissions.catalogue.50726f66697420616e64206d617267696e20252070657220737461676520616e642070726f6a6563742e","Scheduling":"access:permissions.catalogue.5363686564756c696e67","View Gantt":"access:permissions.catalogue.566965772047616e7474","Open the global Gantt and per-project Gantt.":"access:permissions.catalogue.4f70656e2074686520676c6f62616c2047616e747420616e64207065722d70726f6a6563742047616e74742e","View team allocations":"access:permissions.catalogue.56696577207465616d20616c6c6f636174696f6e73","See workload and bookings of other people.":"access:permissions.catalogue.53656520776f726b6c6f616420616e6420626f6f6b696e6773206f66206f746865722070656f706c652e","Edit allocations":"access:permissions.catalogue.4564697420616c6c6f636174696f6e73","Move, add, remove allocations and toggle tentative/committed.":"access:permissions.catalogue.4d6f76652c206164642c2072656d6f766520616c6c6f636174696f6e7320616e6420746f67676c652074656e7461746976652f636f6d6d69747465642e","Timesheets":"access:permissions.catalogue.54696d65736865657473","Log own time":"access:permissions.catalogue.4c6f67206f776e2074696d65","Submit your own timesheet entries.":"access:permissions.catalogue.5375626d697420796f7572206f776e2074696d65736865657420656e74726965732e","View team timesheets":"access:permissions.catalogue.56696577207465616d2074696d65736865657473","See entries of other people.":"access:permissions.catalogue.53656520656e7472696573206f66206f746865722070656f706c652e","Approve timesheets":"access:permissions.catalogue.417070726f76652074696d65736865657473","Mark team timesheets as approved.":"access:permissions.catalogue.4d61726b207465616d2074696d6573686565747320617320617070726f7665642e","Financials":"access:permissions.catalogue.46696e616e6369616c73","View financial dashboard":"access:permissions.catalogue.566965772066696e616e6369616c2064617368626f617264","Cross-project revenue, cost and profit indicators.":"access:permissions.catalogue.43726f73732d70726f6a65637420726576656e75652c20636f737420616e642070726f66697420696e64696361746f72732e","View rates & costs":"access:permissions.catalogue.56696577207261746573202620636f737473","Internal hourly costs, sale rates and rate overrides.":"access:permissions.catalogue.496e7465726e616c20686f75726c7920636f7374732c2073616c6520726174657320616e642072617465206f76657272696465732e","CRM":"access:permissions.catalogue.43524d","View companies":"access:permissions.catalogue.5669657720636f6d70616e696573","Client, supplier and prospect records (legacy crm.companies).":"access:permissions.catalogue.436c69656e742c20737570706c69657220616e642070726f7370656374207265636f72647320286c65676163792063726d2e636f6d70616e696573292e","Edit companies":"access:permissions.catalogue.4564697420636f6d70616e696573","Create and update company records.":"access:permissions.catalogue.43726561746520616e642075706461746520636f6d70616e79207265636f7264732e","View contacts":"access:permissions.catalogue.5669657720636f6e7461637473","Contact directory (legacy crm.contacts).":"access:permissions.catalogue.436f6e74616374206469726563746f727920286c65676163792063726d2e636f6e7461637473292e","Edit contacts":"access:permissions.catalogue.4564697420636f6e7461637473","Create and update contacts.":"access:permissions.catalogue.43726561746520616e642075706461746520636f6e74616374732e","View pipeline & proposals":"access:permissions.catalogue.5669657720706970656c696e6520262070726f706f73616c73","Opportunities, quotes and fee proposals (legacy crm.pipeline).":"access:permissions.catalogue.4f70706f7274756e69746965732c2071756f74657320616e64206665652070726f706f73616c7320286c65676163792063726d2e706970656c696e65292e","Edit pipeline":"access:permissions.catalogue.4564697420706970656c696e65","Move opportunity stages, edit proposals and outcomes.":"access:permissions.catalogue.4d6f7665206f70706f7274756e697479207374616765732c20656469742070726f706f73616c7320616e64206f7574636f6d65732e","Manage quotes & templates":"access:permissions.catalogue.4d616e6167652071756f74657320262074656d706c61746573","Build quotes, templates and convert them to projects.":"access:permissions.catalogue.4275696c642071756f7465732c2074656d706c6174657320616e6420636f6e76657274207468656d20746f2070726f6a656374732e","HR":"access:permissions.catalogue.4852","View own HR record":"access:permissions.catalogue.56696577206f776e204852207265636f7264","Own payslip snapshot, working days and personal data.":"access:permissions.catalogue.4f776e20706179736c697020736e617073686f742c20776f726b696e67206461797320616e6420706572736f6e616c20646174612e","View collaborator list":"access:permissions.catalogue.5669657720636f6c6c61626f7261746f72206c697374","People directory without opening individual records.":"access:permissions.catalogue.50656f706c65206469726563746f727920776974686f7574206f70656e696e6720696e646976696475616c207265636f7264732e","Open collaborator record":"access:permissions.catalogue.4f70656e20636f6c6c61626f7261746f72207265636f7264","Individual HR record, excluding compensation values.":"access:permissions.catalogue.496e646976696475616c204852207265636f72642c206578636c7564696e6720636f6d70656e736174696f6e2076616c7565732e","Edit collaborator record":"access:permissions.catalogue.4564697420636f6c6c61626f7261746f72207265636f7264","Update contracts, capacity and personal HR data.":"access:permissions.catalogue.55706461746520636f6e7472616374732c20636170616369747920616e6420706572736f6e616c20485220646174612e","View compensation":"access:permissions.catalogue.5669657720636f6d70656e736174696f6e","Salary snapshots, net/gross, benefits balances and comparison summary values.":"access:permissions.catalogue.53616c61727920736e617073686f74732c206e65742f67726f73732c2062656e65666974732062616c616e63657320616e6420636f6d70617269736f6e2073756d6d6172792076616c7565732e","Submit own benefit expenses":"access:permissions.catalogue.5375626d6974206f776e2062656e6566697420657870656e736573","Upload receipts and consult own benefit balance.":"access:permissions.catalogue.55706c6f616420726563656970747320616e6420636f6e73756c74206f776e2062656e656669742062616c616e63652e","Approve benefit expenses":"access:permissions.catalogue.417070726f76652062656e6566697420657870656e736573","Approve or reject other collaborators' benefit expenses.":"access:permissions.catalogue.417070726f7665206f722072656a656374206f7468657220636f6c6c61626f7261746f7273272062656e6566697420657870656e7365732e","Request own leave":"access:permissions.catalogue.52657175657374206f776e206c65617665","Submit and track own vacation requests.":"access:permissions.catalogue.5375626d697420616e6420747261636b206f776e207661636174696f6e2072657175657374732e","Approve leave":"access:permissions.catalogue.417070726f7665206c65617665","Approve or reject vacation requests of others.":"access:permissions.catalogue.417070726f7665206f722072656a656374207661636174696f6e207265717565737473206f66206f74686572732e","HR administration":"access:permissions.catalogue.48522061646d696e697374726174696f6e","Permission matrix, meal allowance table, backoffice hourly value and HR configuration.":"access:permissions.catalogue.5065726d697373696f6e206d61747269782c206d65616c20616c6c6f77616e6365207461626c652c206261636b6f666669636520686f75726c792076616c756520616e6420485220636f6e66696775726174696f6e2e","Finance":"access:permissions.catalogue.46696e616e6365","View finance dashboard":"access:permissions.catalogue.566965772066696e616e63652064617368626f617264","Office cash flow, income and expense indicators (legacy finance.dashboard).":"access:permissions.catalogue.4f6666696365206361736820666c6f772c20696e636f6d6520616e6420657870656e736520696e64696361746f727320286c65676163792066696e616e63652e64617368626f617264292e","View financial documents":"access:permissions.catalogue.566965772066696e616e6369616c20646f63756d656e7473","Invoices, credit notes and receipts, issued and received.":"access:permissions.catalogue.496e766f696365732c20637265646974206e6f74657320616e642072656365697074732c2069737375656420616e642072656365697665642e","Edit financial documents":"access:permissions.catalogue.456469742066696e616e6369616c20646f63756d656e7473","Create, edit and settle documents, expenses and payments.":"access:permissions.catalogue.4372656174652c206564697420616e6420736574746c6520646f63756d656e74732c20657870656e73657320616e64207061796d656e74732e","View banking":"access:permissions.catalogue.566965772062616e6b696e67","Bank accounts, balances and transactions.":"access:permissions.catalogue.42616e6b206163636f756e74732c2062616c616e63657320616e64207472616e73616374696f6e732e","Manage banking":"access:permissions.catalogue.4d616e6167652062616e6b696e67","Import statements, classify and reconcile transactions.":"access:permissions.catalogue.496d706f72742073746174656d656e74732c20636c61737369667920616e64207265636f6e63696c65207472616e73616374696f6e732e","View finance reports":"access:permissions.catalogue.566965772066696e616e6365207265706f727473","Cash flow, VAT, forecast and per-project financial reports.":"access:permissions.catalogue.4361736820666c6f772c205641542c20666f72656361737420616e64207065722d70726f6a6563742066696e616e6369616c207265706f7274732e","Manage finance settings":"access:permissions.catalogue.4d616e6167652066696e616e63652073657474696e6773","Classifications, VAT rates, classification rules and imports.":"access:permissions.catalogue.436c617373696669636174696f6e732c205641542072617465732c20636c617373696669636174696f6e2072756c657320616e6420696d706f7274732e","Inventory":"access:permissions.catalogue.496e76656e746f7279","View asset register":"access:permissions.catalogue.56696577206173736574207265676973746572","Open the Inventory module (assets, assignments, reports).":"access:permissions.catalogue.4f70656e2074686520496e76656e746f7279206d6f64756c6520286173736574732c2061737369676e6d656e74732c207265706f727473292e","Products":"access:permissions.catalogue.50726f6475637473","View product library":"access:permissions.catalogue.566965772070726f64756374206c696272617279","Open the Product Library and project schedules.":"access:permissions.catalogue.4f70656e207468652050726f64756374204c69627261727920616e642070726f6a656374207363686564756c65732e","Edit product library":"access:permissions.catalogue.456469742070726f64756374206c696272617279","Create, edit, archive and categorise Product Library items.":"access:permissions.catalogue.4372656174652c20656469742c206172636869766520616e642063617465676f726973652050726f64756374204c696272617279206974656d732e","Portfolio":"access:permissions.catalogue.506f7274666f6c696f","View portfolio":"access:permissions.catalogue.5669657720706f7274666f6c696f","Open the studio portfolio.":"access:permissions.catalogue.4f70656e207468652073747564696f20706f7274666f6c696f2e","Marketing":"access:permissions.catalogue.4d61726b6574696e67","Contribute to marketing":"access:permissions.catalogue.436f6e7472696275746520746f206d61726b6574696e67","Create marketing captures from inside the Hub.":"access:permissions.catalogue.437265617465206d61726b6574696e672063617074757265732066726f6d20696e7369646520746865204875622e","View marketing captures":"access:permissions.catalogue.56696577206d61726b6574696e67206361707475726573","own = only captures I created; all = every capture.":"access:permissions.catalogue.6f776e203d206f6e6c79206361707475726573204920637265617465643b20616c6c203d20657665727920636170747572652e","Curate marketing captures":"access:permissions.catalogue.437572617465206d61726b6574696e67206361707475726573","Edit curation fields, status and clearance of any capture.":"access:permissions.catalogue.45646974206375726174696f6e206669656c64732c2073746174757320616e6420636c656172616e6365206f6620616e7920636170747572652e","Edit marketing strategy":"access:permissions.catalogue.45646974206d61726b6574696e67207374726174656779","Reserved for a later pass (Marketing Bible).":"access:permissions.catalogue.526573657276656420666f722061206c61746572207061737320284d61726b6574696e67204269626c65292e","Reports":"access:permissions.catalogue.5265706f727473","View reports":"access:permissions.catalogue.56696577207265706f727473","Open the Reports module (hours logged and other studio reports).":"access:permissions.catalogue.4f70656e20746865205265706f727473206d6f64756c652028686f757273206c6f6767656420616e64206f746865722073747564696f207265706f727473292e"};
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
    onError: (e: Error) => toast.error(e.message),
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
    onError: (e: Error) => toast.error(e.message),
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
                              {p.key === "projects.edit_week_notes" ? t("weekNotes.editPermission") : p.label}
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
                              <div className="font-medium">{o.permission_key === "projects.edit_week_notes" ? t("weekNotes.editPermission") : def?.label ?? o.permission_key}</div>
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
                            <div className="font-medium">{e.key === "projects.edit_week_notes" ? t("weekNotes.editPermission") : def?.label ?? e.key}</div>
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
                    <span>{p.permission_key === "projects.edit_week_notes" ? t("weekNotes.editPermission") : def?.label ?? p.permission_key}</span>
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
