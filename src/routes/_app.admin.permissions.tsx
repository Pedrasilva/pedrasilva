import { useMemo, useState } from "react";
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

export const Route = createFileRoute("/_app/admin/permissions")({
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
  return (
    <AdminOnly>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6" /> Permissões (v2)
          </h1>
          <p className="text-sm text-muted-foreground">
            Perfis base por função, com autorizações e revogações individuais por
            utilizador. Efetivo = base do perfil ∪ autorizações − revogações.
          </p>
        </div>
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Por utilizador</TabsTrigger>
            <TabsTrigger value="roles">Perfis base</TabsTrigger>
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
      toast.success("Permissão atualizada");
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
      toast.success("Exceção removida");
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
          <CardTitle className="text-base">Utilizadores</CardTitle>
          <CardDescription>{users.length} contas</CardDescription>
          <Input
            placeholder="Procurar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2"
          />
        </CardHeader>
        <CardContent className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
          {usersQuery.isLoading && (
            <p className="p-2 text-sm text-muted-foreground">A carregar…</p>
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
                {u.is_admin && <Badge variant="destructive">Admin</Badge>}
                {(u.assigned_roles ?? []).map((r) => (
                  <Badge key={r} variant="secondary">
                    {ROLE_LABEL[r] ?? r}
                  </Badge>
                ))}
                {!u.is_admin && (u.assigned_roles ?? []).length === 0 && (
                  <span>Sem perfil</span>
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
              Selecione um utilizador para rever as permissões efetivas.
            </CardContent>
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
                    ? "Admin — passa todas as verificações"
                    : (user.assigned_roles ?? []).map((r) => ROLE_LABEL[r] ?? r).join(", ") ||
                      "Sem perfil atribuído"}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Adicionar exceção</CardTitle>
                <CardDescription>
                  Autorização adicional ou revogação sobre o perfil base.
                </CardDescription>
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
                      <SelectValue placeholder="Permissão…" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODULES.map((m) => (
                        <div key={m}>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                            {m}
                          </div>
                          {PERMISSION_CATALOGUE.filter((p) => p.module === m).map((p) => (
                            <SelectItem key={p.key} value={p.key}>
                              {p.label}
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
                        {SCOPE_LABEL[s]}
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
                  <Plus className="mr-1 h-4 w-4" /> Autorizar
                </Button>
                <Button
                  variant="outline"
                  disabled={!newKey || upsert.isPending}
                  onClick={() =>
                    upsert.mutate({ key: newKey, scope: newScope, granted: false })
                  }
                >
                  <Minus className="mr-1 h-4 w-4" /> Revogar
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Exceções individuais</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {overrides.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Sem exceções — o utilizador tem apenas o perfil base.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Permissão</TableHead>
                        <TableHead>Âmbito</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...knownOverrides, ...legacyOverrides].map((o) => {
                        const def = PERMISSION_BY_KEY.get(o.permission_key as V2PermissionKey);
                        return (
                          <TableRow key={o.id}>
                            <TableCell>
                              <div className="font-medium">{def?.label ?? o.permission_key}</div>
                              <div className="text-xs text-muted-foreground">
                                {o.permission_key}
                                {!def && " · legado"}
                              </div>
                            </TableCell>
                            <TableCell>
                              {SCOPE_LABEL[o.scope as PermissionScope] ?? o.scope}
                            </TableCell>
                            <TableCell>
                              {o.granted ? (
                                <Badge variant="secondary">
                                  <Check className="mr-1 h-3 w-3" /> Autorizado
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <X className="mr-1 h-3 w-3" /> Revogado
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => remove.mutate(o.id)}
                              >
                                Remover
                              </Button>
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
                <CardTitle className="text-base">Permissões efetivas</CardTitle>
                <CardDescription>
                  {user.is_admin
                    ? "Admin — acesso total, independentemente da lista abaixo."
                    : "Resultado do perfil base com as exceções aplicadas."}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Permissão</TableHead>
                      <TableHead>Âmbito</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {effective.map((e) => {
                      const def = PERMISSION_BY_KEY.get(e.key as V2PermissionKey);
                      return (
                        <TableRow key={`${e.key}|${e.scope}`}>
                          <TableCell>
                            <div className="font-medium">{def?.label ?? e.key}</div>
                            <div className="text-xs text-muted-foreground">{e.key}</div>
                          </TableCell>
                          <TableCell>
                            {SCOPE_LABEL[e.scope as PermissionScope] ?? e.scope}
                          </TableCell>
                          <TableCell>
                            <Badge variant={e.source === "role" ? "outline" : "secondary"}>
                              {e.source === "role" ? "Perfil" : "Exceção"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {effective.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground">
                          Sem permissões efetivas.
                        </TableCell>
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
              <CardTitle className="text-base">{ROLE_LABEL[role]}</CardTitle>
              <CardDescription>{ROLE_DESCRIPTION[role]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {role === "admin" && (
                <p className="text-sm text-muted-foreground">
                  Acesso total — não depende desta tabela.
                </p>
              )}
              {perms.length === 0 && role !== "admin" && (
                <p className="text-sm text-muted-foreground">Sem permissões base.</p>
              )}
              {perms.map((p) => {
                const def = PERMISSION_BY_KEY.get(p.permission_key as V2PermissionKey);
                return (
                  <div
                    key={`${p.permission_key}|${p.scope}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>{def?.label ?? p.permission_key}</span>
                    <Badge variant="outline">
                      {SCOPE_LABEL[p.scope as PermissionScope] ?? p.scope}
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
