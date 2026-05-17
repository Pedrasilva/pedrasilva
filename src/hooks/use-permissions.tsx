import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Carrega todas as permissões do utilizador autenticado.
 * Admins não dependem destas chaves (vêem tudo) — o hook devolve
 * `isAdmin: true` para o caller poder fazer short-circuit.
 */
/** Baseline permissions every collaborator should have access to. Used as a
 * virtual permission set when an admin impersonates a collaborator (the admin
 * user row itself has no entries in `user_permissions` because admins bypass).
 */
// Baseline only covers self-service "own" surfaces every collaborator gets
// regardless of explicit permission grants. Module access (CRM, Projects
// listings, Finance, etc.) must be granted explicitly via the admin
// permission matrix — never auto-included here, otherwise impersonation
// would leak access the real user does not have.
const COLLABORATOR_BASELINE: PermissionKey[] = [
  "hr.minha-ficha",
  "hr.dias-uteis",
  "hr.beneficios.own",
  "hr.ferias.own",
];

export function useMyPermissions() {
  const { user, isAdmin, isRealAdmin, viewAsUser, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["my-permissions", user?.id],
    enabled: !!user && !authLoading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permission_key")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.permission_key as PermissionKey);
    },
  });

  const permissions = new Set<PermissionKey>(query.data ?? []);
  // When an admin is impersonating a collaborator, grant the baseline
  // collaborator permissions so "own"-scoped pages (férias, benefícios,
  // minha-ficha, etc.) render instead of showing "Acesso restrito".
  if (isRealAdmin && viewAsUser) {
    for (const k of COLLABORATOR_BASELINE) permissions.add(k);
  }

  return {
    isAdmin,
    loading: authLoading || query.isLoading,
    permissions,
  };
}

export function useHasPermission(key: PermissionKey): {
  loading: boolean;
  allowed: boolean;
} {
  const { isAdmin, loading, permissions } = useMyPermissions();
  return {
    loading,
    allowed: isAdmin || permissions.has(key),
  };
}
