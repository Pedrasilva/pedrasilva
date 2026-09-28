import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { PermissionKey } from "@/lib/permissions";
import { useViewAsUserId } from "@/hooks/use-view-as-user-id";

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
// Self-service surfaces every collaborator gets by default. These are
// "own"-scoped pages (my own profile, my own leave, my own tasks, my own
// timesheet) — never module-wide listings (CRM, Projects All, Finance, HR
// admin) which must be granted explicitly via the permission matrix.
const COLLABORATOR_BASELINE: PermissionKey[] = [
  "hr.minha-ficha",
  "hr.dias-uteis",
  "hr.beneficios.own",
  "hr.ferias.own",
  "projects.my-tasks",
  "projects.timesheet",
];

export function useMyPermissions() {
  const { user, isAdmin, isRealAdmin, viewAsUser, loading: authLoading } = useAuth();

  // View As → load the viewed person's permissions (fail closed if unresolved).
  const { active: viewAsActive, userId: targetId, loading: targetLoading } = useViewAsUserId();

  const query = useQuery({
    queryKey: ["my-permissions", user?.id, viewAsActive ? "view-as" : "self", targetId],
    enabled: !!user && !authLoading && !targetLoading && !!targetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permission_key")
        .eq("user_id", targetId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.permission_key as PermissionKey);
    },
  });

  // Errors / unresolved viewed id → empty set (fail closed).
  const permissions = new Set<PermissionKey>(query.isError ? [] : (query.data ?? []));
  // When an admin is impersonating a collaborator, grant the baseline
  // collaborator permissions so "own"-scoped pages (férias, benefícios,
  // minha-ficha, etc.) render instead of showing "Acesso restrito".
  if (isRealAdmin && viewAsUser) {
    for (const k of COLLABORATOR_BASELINE) permissions.add(k);
  }

  return {
    isAdmin,
    loading: authLoading || targetLoading || query.isLoading,
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
