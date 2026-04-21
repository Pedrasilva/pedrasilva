import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Carrega todas as permissões do utilizador autenticado.
 * Admins não dependem destas chaves (vêem tudo) — o hook devolve
 * `isAdmin: true` para o caller poder fazer short-circuit.
 */
export function useMyPermissions() {
  const { user, isAdmin, loading: authLoading } = useAuth();

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

  return {
    isAdmin,
    loading: authLoading || query.isLoading,
    permissions: new Set<PermissionKey>(query.data ?? []),
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
