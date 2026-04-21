import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Shield, ExternalLink, AlertCircle, Plus, Crown, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NewCollaboratorDialog } from "@/components/NewCollaboratorDialog";
import { PERMISSION_GROUPS, type PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type UserRow = {
  user_id: string;
  email: string;
  is_admin: boolean;
  is_super_admin: boolean;
  collaborator_id: string | null;
  collaborator_nome: string | null;
  permissions: PermissionKey[];
};

export const Route = createFileRoute("/_app/hr/admin")({
  component: () => (
    <AdminOnly>
      <AdminPage />
    </AdminOnly>
  ),
});

function AdminPage() {
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
      toast.success(vars.isAdmin ? "Admin atribuído" : "Admin removido");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Shield className="h-5 w-5" /> Administração
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Gestão de utilizadores e permissões. Admins vêem tudo
            automaticamente. Para os restantes, marque/desmarque cada
            funcionalidade na matriz abaixo.
          </p>
        </div>
        <NewCollaboratorDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Novo colaborador
            </Button>
          }
        />
      </div>

      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions">Permissões</TabsTrigger>
          <TabsTrigger value="users">Utilizadores & Admins</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="mt-4">
          <PermissionsMatrix
            users={users}
            isLoading={isLoading}
            onSave={async (changes) => {
              // changes: { userId, key, granted }[]
              for (const c of changes) {
                await setPermission.mutateAsync(c);
              }
            }}
          />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Utilizadores registados</CardTitle>
              <CardDescription>
                O super-admin (Luis) não pode perder o estatuto. Não pode
                remover o seu próprio acesso de admin.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">A carregar…</div>
              ) : users.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Sem utilizadores registados.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead className="text-right">Admin</TableHead>
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
                              {isSelf && "tu"}
                              {u.is_super_admin && " · super-admin"}
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
                                <AlertCircle className="h-3 w-3" /> sem ficha
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              {u.is_admin && <Badge>Admin</Badge>}
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
            Os utilizadores aparecem aqui assim que fazem o primeiro login com
            o email registado na ficha.
          </p>
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
    changes: { userId: string; key: PermissionKey; granted: boolean }[],
  ) => Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  // Local edits keyed by `${userId}::${key}` -> granted boolean
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

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
    const list: { userId: string; key: PermissionKey; granted: boolean }[] = [];
    for (const u of users) {
      for (const g of PERMISSION_GROUPS) {
        for (const item of g.items) {
          const k = `${u.user_id}::${item.key}`;
          if (k in edits && edits[k] !== u.permissions.includes(item.key)) {
            list.push({ userId: u.user_id, key: item.key, granted: edits[k] });
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
          A carregar…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Matriz de permissões</CardTitle>
            <CardDescription>
              Marque o que cada utilizador pode aceder e clique em Guardar.
              Admins têm tudo automaticamente (linha cinzenta).
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Procurar utilizador…"
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
                Descartar
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={dirtyCount === 0 || saving}>
              {saving
                ? "A guardar…"
                : dirtyCount > 0
                  ? `Guardar (${dirtyCount})`
                  : "Guardar"}
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
                    Utilizador
                  </th>
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
                    {filtered.length} utilizador(es)
                  </th>
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
                      <div className="flex items-center gap-2 font-medium">
                        {u.is_super_admin && (
                          <Crown className="h-3.5 w-3.5 text-amber-500" />
                        )}
                        <span className="truncate">
                          {u.collaborator_nome ?? u.email}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {u.collaborator_nome ? u.email : "sem ficha"}
                        {u.is_admin && " · admin"}
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
                      Sem utilizadores que correspondam à pesquisa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
        {dirtyCount > 0 && (
          <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            {dirtyCount} alteração{dirtyCount === 1 ? "" : "ões"} por guardar.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
