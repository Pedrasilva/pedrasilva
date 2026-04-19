import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, ExternalLink, AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NewCollaboratorDialog } from "@/components/NewCollaboratorDialog";

type UserRow = {
  user_id: string;
  email: string;
  created_at: string;
  is_admin: boolean;
  collaborator_id: string | null;
  collaborator_nome: string | null;
  collaborator_departamento: string | null;
};

export const Route = createFileRoute("/_app/admin")({
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
    queryKey: ["admin-users"],
    queryFn: async () => {
      // RPC ainda não está nos types gerados — cast seguro.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: UserRow[] | null; error: Error | null }>)(
        "list_users_with_roles",
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
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Shield className="h-5 w-5" /> Administração
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestão de permissões. O <em>departamento</em> (Backoffice/Projecto) é
          apenas etiqueta organizacional — não atribui automaticamente
          permissões de admin.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilizadores registados</CardTitle>
          <CardDescription>
            Activa o interruptor para promover um utilizador a admin. Não podes
            remover o teu próprio admin.
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
                  <TableHead>Departamento</TableHead>
                  <TableHead className="text-right">Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.user_id === user?.id;
                  return (
                    <TableRow key={u.user_id}>
                      <TableCell>
                        <div className="font-medium">{u.email}</div>
                        <div className="text-[11px] text-muted-foreground">
                          desde {new Date(u.created_at).toLocaleDateString("pt-PT")}
                          {isSelf && " · tu"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.collaborator_id ? (
                          <Link
                            to="/colaborador/$id"
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
                      <TableCell>
                        {u.collaborator_departamento ? (
                          <Badge variant="secondary">
                            {u.collaborator_departamento}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          {u.is_admin && <Badge>Admin</Badge>}
                          <Switch
                            checked={u.is_admin}
                            disabled={
                              setAdmin.isPending || (isSelf && u.is_admin)
                            }
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

      <p className="text-[11px] text-muted-foreground">
        Os utilizadores que ainda não criaram conta não aparecem aqui. Assim que
        fizerem o primeiro login com o email registado na ficha, ficam
        disponíveis para gestão.
      </p>
    </div>
  );
}
