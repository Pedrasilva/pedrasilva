import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AdminOnly } from "@/components/AdminOnly";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Shield,
  ExternalLink,
  AlertCircle,
  Plus,
  Crown,
  Search,
  Archive,
  ArchiveRestore,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pencil,
  Check,
  X,
  Eye,
} from "lucide-react";
import {
  useArchiveInternalCategory,
  useCreateInternalCategory,
  useDeleteInternalCategory,
  useInternalCategories,
  useReorderInternalCategories,
  useRestoreInternalCategory,
  useUpdateInternalCategory,
  ALL_WORK_PROFILES,
  type InternalCategoryRow,
} from "@/lib/projects/use-internal-categories";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NewCollaboratorDialog } from "@/components/NewCollaboratorDialog";
import { PERMISSION_GROUPS, type PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { SalaryImporter } from "@/components/hr/salary-importer";

type UserRow = {
  user_id: string;
  email: string;
  is_admin: boolean;
  is_super_admin: boolean;
  collaborator_id: string | null;
  collaborator_nome: string | null;
  permissions: PermissionKey[];
  pending?: boolean;
};

export const Route = createFileRoute("/_app/hr/admin")({
  component: () => (
    <AdminOnly>
      <AdminPage />
    </AdminOnly>
  ),
});

function AdminPage() {
  useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users-with-permissions"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: UserRow[] | null; error: Error | null }>)(
        "list_users_with_permissions",
      );
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  const setAdmin = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const { error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: Error | null }>)("set_user_admin", {
        _user_id: userId,
        _is_admin: isAdmin,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.isAdmin ? uiI18n.t("access:batchFive.labels.administratorAssigned") : uiI18n.t("access:batchFive.labels.administratorRemoved"));
      qc.invalidateQueries({ queryKey: ["admin-users-with-permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPermission = useMutation({
    mutationFn: async ({
      userId,
      key,
      granted,
    }: {
      userId: string;
      key: PermissionKey;
      granted: boolean;
    }) => {
      const { error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: Error | null }>)("set_user_permission", {
        _user_id: userId,
        _key: key,
        _granted: granted,
      });
      if (error) throw error;
    },
    onMutate: async ({ userId, key, granted }) => {
      await qc.cancelQueries({ queryKey: ["admin-users-with-permissions"] });
      const prev = qc.getQueryData<UserRow[]>(["admin-users-with-permissions"]);
      qc.setQueryData<UserRow[]>(["admin-users-with-permissions"], (old) =>
        (old ?? []).map((u) =>
          u.user_id === userId
            ? {
                ...u,
                permissions: granted
                  ? Array.from(new Set([...u.permissions, key]))
                  : u.permissions.filter((p) => p !== key),
              }
            : u,
        ),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      toast.error(e.message);
      if (ctx?.prev) qc.setQueryData(["admin-users-with-permissions"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-users-with-permissions"] });
    },
  });

  const setPendingPermission = useMutation({
    mutationFn: async ({
      email,
      key,
      granted,
    }: {
      email: string;
      key: PermissionKey;
      granted: boolean;
    }) => {
      const { error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: Error | null }>)("set_pending_permission", {
        _email: email,
        _key: key,
        _granted: granted,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-users-with-permissions"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Shield className="h-5 w-5" />  {uiI18n.t("common:administration")} </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
             {uiI18n.t("access:batchFive.labels.manageAccountsAndPermissionsAdministratorsSeeEverything")} </p>
        </div>
        <NewCollaboratorDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" />  {uiI18n.t("hr:landing.newButton")} </Button>
          }
        />
      </div>

      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions"> {uiI18n.t("hr:nav.permissions")} </TabsTrigger>
          <TabsTrigger value="users"> {uiI18n.t("access:batchFive.labels.accountsAndAdministrators")} </TabsTrigger>
          <TabsTrigger value="internal-categories"> {uiI18n.t("access:batchFive.labels.internalCostCentres")} </TabsTrigger>
          <TabsTrigger value="salary-import"> {uiI18n.t("access:batchFive.labels.importSalariesHr")} </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="mt-4">
          <PermissionsMatrix
            users={users}
            isLoading={isLoading}
            onSave={async (changes) => {
              for (const c of changes) {
                if (c.pending) {
                  await setPendingPermission.mutateAsync({
                    email: c.email,
                    key: c.key,
                    granted: c.granted,
                  });
                } else {
                  await setPermission.mutateAsync({
                    userId: c.userId,
                    key: c.key,
                    granted: c.granted,
                  });
                }
              }
            }}
          />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base"> {uiI18n.t("access:batchFive.labels.registeredAccounts")} </CardTitle>
              <CardDescription>
                 {uiI18n.t("access:batchFive.labels.theSuperAdministratorLuisCannotLoseThat")} </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </div>
              ) : users.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                   {uiI18n.t("access:batchFive.labels.noRegisteredAccounts")} </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead> {uiI18n.t("common:email")} </TableHead>
                      <TableHead> {uiI18n.t("glossary:hr.employee")} </TableHead>
                      <TableHead className="text-right"> {uiI18n.t("glossary:permissions.roles.admin")} </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const isSelf = u.user_id === user?.id;
                      const locked = u.is_super_admin || (isSelf && u.is_admin);
                      return (
                        <TableRow key={u.user_id}>
                          <TableCell>
                            <div className="flex items-center gap-2 font-medium">
                              {u.is_super_admin && (
                                <Crown className="h-4 w-4 text-amber-500" />
                              )}
                              {u.email}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {isSelf && uiI18n.t("access:batchFive.labels.you")}
                              {u.is_super_admin && uiI18n.t("access:batchFive.labels.superAdministrator")}
                            </div>
                          </TableCell>
                          <TableCell>
                            {u.collaborator_id ? (
                              <Link
                                to="/hr/colaborador/$id"
                                params={{ id: u.collaborator_id }}
                                className="inline-flex items-center gap-1 text-sm hover:underline"
                              >
                                {u.collaborator_nome}
                                <ExternalLink className="h-3 w-3 opacity-60" />
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <AlertCircle className="h-3 w-3" />  {uiI18n.t("access:batchFive.labels.noSheet")} </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              {u.is_admin && <Badge> {uiI18n.t("glossary:permissions.roles.admin")} </Badge>}
                              <Switch
                                checked={u.is_admin}
                                disabled={setAdmin.isPending || locked}
                                onCheckedChange={(v) =>
                                  setAdmin.mutate({ userId: u.user_id, isAdmin: v })
                                }
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="mt-3 text-[11px] text-muted-foreground">
             {uiI18n.t("access:batchFive.labels.accountsAppearHereAfterTheFirstSign")} </p>
        </TabsContent>

        <TabsContent value="internal-categories" className="mt-4">
          <InternalCategoriesAdmin />
        </TabsContent>

        <TabsContent value="salary-import" className="mt-4">
          <SalaryImporter />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PermissionsMatrix({
  users,
  isLoading,
  onSave,
}: {
  users: UserRow[];
  isLoading: boolean;
  onSave: (
    changes: {
      userId: string;
      email: string;
      pending: boolean;
      key: PermissionKey;
      granted: boolean;
    }[],
  ) => Promise<void>;
}) {
  useTranslation();
  const [filter, setFilter] = useState("");
  // Local edits keyed by `${userId}::${key}` -> granted boolean
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { user: currentUser, isRealAdmin, setViewAsUser, setViewAsCollaboratorId } = useAuth();

  const handleViewAs = (u: UserRow) => {
    if (!u.collaborator_id) {
      toast.error(uiI18n.t("access:batchFive.labels.thisAccountHasNoLinkedCollaboratorSheet"));
      return;
    }
    setViewAsUser(true);
    setViewAsCollaboratorId(u.collaborator_id);
    toast.success(uiI18n.t("access:batchFive.labels.viewingTheAppAsWithValues"));
    navigate({ to: "/hr/minha-ficha" });
  };

  // Reset local edits when fresh data arrives (e.g. after save)
  useEffect(() => {
    setEdits({});
  }, [users]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.collaborator_nome ?? "").toLowerCase().includes(q),
    );
  }, [users, filter]);

  const isChecked = (u: UserRow, key: PermissionKey): boolean => {
    const k = `${u.user_id}::${key}`;
    if (k in edits) return edits[k];
    return u.permissions.includes(key);
  };

  const isDirty = (u: UserRow, key: PermissionKey): boolean => {
    const k = `${u.user_id}::${key}`;
    if (!(k in edits)) return false;
    return edits[k] !== u.permissions.includes(key);
  };

  const pendingChanges = useMemo(() => {
    const list: {
      userId: string;
      email: string;
      pending: boolean;
      key: PermissionKey;
      granted: boolean;
    }[] = [];
    for (const u of users) {
      for (const g of PERMISSION_GROUPS) {
        for (const item of g.items) {
          const k = `${u.user_id}::${item.key}`;
          if (k in edits && edits[k] !== u.permissions.includes(item.key)) {
            list.push({
              userId: u.user_id,
              email: u.email,
              pending: !!u.pending,
              key: item.key,
              granted: edits[k],
            });
          }
        }
      }
    }
    return list;
  }, [edits, users]);

  const dirtyCount = pendingChanges.length;

  const handleToggle = (userId: string, key: PermissionKey, granted: boolean) => {
    setEdits((prev) => ({ ...prev, [`${userId}::${key}`]: granted }));
  };

  const handleSave = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      await onSave(pendingChanges);
      toast.success(
        `${dirtyCount} alteração${dirtyCount === 1 ? "" : "ões"} guardada${
          dirtyCount === 1 ? "" : "s"
        }`,
      );
      setEdits({});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => setEdits({});

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
           {uiI18n.t("common:loading")} </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base"> {uiI18n.t("access:batchFive.labels.permissionsMatrix")} </CardTitle>
            <CardDescription>
               {uiI18n.t("access:batchFive.labels.selectTheFeaturesEachAccountCanAccess")} </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={uiI18n.t("access:batchFive.labels.searchAccounts")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8"
              />
            </div>
            {dirtyCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                disabled={saving}
              >
                 {uiI18n.t("access:batchFive.labels.discard")} </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={dirtyCount === 0 || saving}>
              {saving
                ? uiI18n.t("common:saving")
                : dirtyCount > 0
                  ? uiI18n.t("access:batchFive.labels.saveWithValues")
                  : uiI18n.t("common:save")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TooltipProvider delayDuration={300}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="sticky left-0 z-10 min-w-[220px] border-r bg-muted/30 px-3 py-2 text-left font-medium">
                     {uiI18n.t("glossary:entity.user")} </th>
                  {PERMISSION_GROUPS.map((g) => (
                    <th
                      key={g.module}
                      colSpan={g.items.length}
                      className="border-l border-r px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {g.module}
                    </th>
                  ))}
                </tr>
                <tr className="border-b bg-muted/10">
                  <th className="sticky left-0 z-10 border-r bg-muted/10 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    {filtered.length}  {uiI18n.t("access:batchFive.labels.accountS")} </th>
                  {PERMISSION_GROUPS.flatMap((g) =>
                    g.items.map((item) => (
                      <th
                        key={item.key}
                        className="min-w-[44px] border-l px-1 py-2 text-center align-bottom"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="mx-auto h-24 w-7 [writing-mode:vertical-rl] rotate-180 cursor-default text-[11px] font-medium text-muted-foreground">
                              {item.label}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px]">
                            <div className="font-medium">{item.label}</div>
                            {item.description && (
                              <div className="text-xs text-muted-foreground">
                                {item.description}
                              </div>
                            )}
                            <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                              {item.key}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.user_id} className="border-b hover:bg-muted/20">
                    <td
                      className={cn(
                        "sticky left-0 z-10 border-r bg-card px-3 py-2",
                        u.is_admin && "bg-muted/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            {u.is_super_admin && (
                              <Crown className="h-3.5 w-3.5 text-amber-500" />
                            )}
                            <span className="truncate">
                              {u.collaborator_nome ?? u.email}
                            </span>
                            {u.pending && (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-amber-500/40 bg-amber-500/10 text-[10px] font-normal text-amber-700 dark:text-amber-300"
                              >
                                 {uiI18n.t("common:awaitingInvitation")} </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {u.collaborator_nome ? u.email : uiI18n.t("access:batchFive.labels.noSheet")}
                            {u.is_admin && uiI18n.t("access:batchFive.labels.administrator")}
                            {u.pending && uiI18n.t("access:batchFive.labels.noAccessYet")}
                          </div>
                        </div>
                        {isRealAdmin && u.user_id !== currentUser?.id && u.collaborator_id && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={() => handleViewAs(u)}
                                aria-label={uiI18n.t("access:batchFive.labels.viewTheAppAsWithValues")}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                               {uiI18n.t("access:batchFive.labels.viewTheAppAsThisAccount")} </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    {PERMISSION_GROUPS.flatMap((g) =>
                      g.items.map((item) => {
                        const checked = u.is_admin || isChecked(u, item.key);
                        const dirty = isDirty(u, item.key);
                        return (
                          <td
                            key={item.key}
                            className={cn(
                              "border-l px-1 py-2 text-center",
                              u.is_admin && "bg-muted/30",
                              dirty && "bg-amber-100/50 dark:bg-amber-500/10",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={u.is_admin || saving}
                              onCheckedChange={(v) =>
                                handleToggle(u.user_id, item.key, !!v)
                              }
                              aria-label={`${item.label} para ${u.email}`}
                            />
                          </td>
                        );
                      }),
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={1 + PERMISSION_GROUPS.reduce((n, g) => n + g.items.length, 0)}
                      className="px-3 py-8 text-center text-sm text-muted-foreground"
                    >
                       {uiI18n.t("access:batchFive.labels.noAccountsMatchYourSearch")} </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
        {dirtyCount > 0 && (
          <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            {dirtyCount}  {uiI18n.t("access:batchFive.labels.change")} {dirtyCount === 1 ? "" : uiI18n.t("access:batchFive.labels.s")}  {uiI18n.t("access:batchFive.labels.unsaved")} </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Internal cost-centers admin
// =============================================================================
//
// CRUD + archive + reorder UI for the `pm_internal_categories` table. Archived
// categories stop appearing in the timesheet picker for new entries, but
// historical reports keep working because `pm_time_entries.internal_category`
// stores the category name as plain text.

const PROFILE_LABELS: Record<string, string> = {
  project: "Projecto",
  mixed: "Misto",
  support: "Suporte",
};

/**
 * Work-profile visibility toggles for one internal cost center.
 * Timesheet UX only — controls which profiles may pick this category for NEW
 * entries. Historical time entries are never affected.
 */
function ProfileVisibilityCell({
  row,
  disabled,
  onChange,
}: {
  row: InternalCategoryRow;
  disabled?: boolean;
  onChange: (profiles: string[]) => void;
}) {
  useTranslation();
  const current = row.visible_to_profiles ?? [...ALL_WORK_PROFILES];
  const toggle = (p: string, checked: boolean) => {
    const next = checked ? [...current, p] : current.filter((x) => x !== p);
    if (!next.length) {
      toast.error(uiI18n.t("access:batchFive.labels.chooseAtLeastOneRole"));
      return;
    }
    onChange(ALL_WORK_PROFILES.filter((x) => next.includes(x)));
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {ALL_WORK_PROFILES.map((p) => {
        const checked = current.includes(p);
        return (
          <label
            key={p}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(v) => toggle(p, !!v)}
              aria-label={uiI18n.t("access:batchFive.labels.visibleToWithValues")}
            />
            <Badge variant={checked ? "secondary" : "outline"} className="text-[10px]">
              {PROFILE_LABELS[p]}
            </Badge>
          </label>
        );
      })}
    </div>
  );
}

function InternalCategoriesAdmin() {
  useTranslation();
  const [includeArchived, setIncludeArchived] = useState(true);
  const { data: rows = [], isLoading } = useInternalCategories({ includeArchived });
  const create = useCreateInternalCategory();
  const update = useUpdateInternalCategory();
  const archive = useArchiveInternalCategory();
  const restore = useRestoreInternalCategory();
  const remove = useDeleteInternalCategory();
  const reorder = useReorderInternalCategories();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const active = useMemo(() => rows.filter((r) => !r.archived_at), [rows]);
  const archived = useMemo(() => rows.filter((r) => r.archived_at), [rows]);

  const moveActive = (id: string, dir: -1 | 1) => {
    const idx = active.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= active.length) return;
    const next = active.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    reorder.mutate(next.map((r) => r.id));
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({ name });
      setNewName("");
      toast.success(uiI18n.t("access:batchFive.labels.costCentreCreated"));
    } catch (e) {
      toast.error((e as Error).message || uiI18n.t("common:failed"));
    }
  };

  const startEdit = (row: InternalCategoryRow) => {
    setEditingId(row.id);
    setEditName(row.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };
  const saveEdit = async (row: InternalCategoryRow) => {
    if (!editName.trim() || editName.trim() === row.name) {
      cancelEdit();
      return;
    }
    try {
      await update.mutateAsync({ id: row.id, name: editName });
      toast.success(uiI18n.t("access:batchFive.labels.renamed"));
      cancelEdit();
    } catch (e) {
      toast.error((e as Error).message || uiI18n.t("common:failed"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base"> {uiI18n.t("access:batchFive.labels.internalCostCentres")} </CardTitle>
        <CardDescription>
           {uiI18n.t("access:batchFive.labels.timesheetCategoriesForInternalHoursMeetingsTraining")} </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
               {uiI18n.t("access:batchFive.labels.newCostCentre")} </label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={uiI18n.t("access:batchFive.labels.eGRecruitment")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>
          <Button onClick={handleCreate} disabled={create.isPending || !newName.trim()}>
            <Plus className="h-4 w-4" />  {uiI18n.t("common:add")} </Button>
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={includeArchived}
              onCheckedChange={(v) => setIncludeArchived(!!v)}
            />
             {uiI18n.t("access:batchFive.labels.showArchived")} </label>
        </div>

        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
             {uiI18n.t("access:batchFive.labels.active")} {active.length})
          </h3>
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </div>
          ) : active.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
               {uiI18n.t("access:batchFive.labels.noActiveCategoriesTheTimesheetWillHave")} </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]"> {uiI18n.t("common:order")} </TableHead>
                  <TableHead> {uiI18n.t("common:name")} </TableHead>
                  <TableHead className="w-[280px]"> {uiI18n.t("access:batchFive.labels.visibleTo")} </TableHead>
                  <TableHead className="text-right"> {uiI18n.t("common:actions")} </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((row, i) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={i === 0 || reorder.isPending}
                          onClick={() => moveActive(row.id, -1)}
                          aria-label={uiI18n.t("access:batchFive.labels.moveUp")}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={i === active.length - 1 || reorder.isPending}
                          onClick={() => moveActive(row.id, 1)}
                          aria-label={uiI18n.t("access:batchFive.labels.moveDown")}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingId === row.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="max-w-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(row);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => saveEdit(row)}
                            disabled={update.isPending}
                            aria-label={uiI18n.t("common:save")}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={cancelEdit}
                            aria-label={uiI18n.t("common:cancel")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-medium">{row.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ProfileVisibilityCell
                        row={row}
                        disabled={update.isPending}
                        onChange={(profiles) =>
                          update
                            .mutateAsync({ id: row.id, visible_to_profiles: profiles })
                            .catch((e) =>
                              toast.error((e as Error).message || uiI18n.t("common:failed")),
                            )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {editingId !== row.id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEdit(row)}
                            aria-label={uiI18n.t("access:batchFive.labels.rename")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => archive.mutate(row.id)}
                                disabled={archive.isPending}
                                aria-label={uiI18n.t("common:archive")}
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                               {uiI18n.t("access:batchFive.labels.removesTheCategoryFromTimesheetChoicesHistory")} </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {includeArchived && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
               {uiI18n.t("access:batchFive.labels.archived")} {archived.length})
            </h3>
            {archived.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                 {uiI18n.t("access:batchFive.labels.noArchivedCategories")} </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead> {uiI18n.t("common:name")} </TableHead>
                    <TableHead> {uiI18n.t("access:batchFive.labels.archivedOn")} </TableHead>
                    <TableHead className="text-right"> {uiI18n.t("common:actions")} </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archived.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground line-through">
                        {row.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.archived_at
                          ? new Date(row.archived_at).toLocaleDateString(uiI18n.language)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => restore.mutate(row.id)}
                            disabled={restore.isPending}
                            aria-label={uiI18n.t("common:restore")}
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </Button>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        uiI18n.t("access:batchFive.labels.permanentlyDeleteThisActionIsIrreversibleAndWithValues"),
                                      )
                                    ) {
                                      remove.mutate(row.id);
                                    }
                                  }}
                                  disabled={remove.isPending}
                                  aria-label={uiI18n.t("access:batchFive.labels.permanentlyDelete")}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                 {uiI18n.t("access:batchFive.labels.permanentlyDeletingMayAffectHistoricalReportsArchiving")} </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

