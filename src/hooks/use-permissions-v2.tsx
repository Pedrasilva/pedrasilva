import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  type EffectivePermissionRow,
  type PermissionScope,
  type PmRole,
  type V2PermissionKey,
  bestScope as bestScopeFn,
  hasModuleScope,
} from "@/lib/permissions-v2";

interface EffectiveRpcRow {
  permission_key: string;
  scope: string;
  source: string;
}

/**
 * Loads role assignment + effective permissions for the signed-in user.
 *
 * Returns helpers used across the app:
 *   - `can(key, scope?)`   — yes/no (admins always pass)
 *   - `bestScope(key)`     — broadest scope the user has for `key`, or null
 *
 * Effective permissions are: role baseline ∪ overrides − revokes (server-side).
 */
export function useMyPermissionsV2() {
  const { user, isAdmin, loading: authLoading } = useAuth();

  const roleQuery = useQuery({
    queryKey: ["my-pm-role", user?.id],
    enabled: !!user && !authLoading,
    staleTime: 60_000,
    queryFn: async (): Promise<PmRole | null> => {
      const { data, error } = await supabase
        .from("user_role_assignments")
        .select("role")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.role ?? null) as PmRole | null;
    },
  });

  const effectiveQuery = useQuery({
    queryKey: ["my-effective-permissions", user?.id],
    enabled: !!user && !authLoading,
    staleTime: 60_000,
    queryFn: async (): Promise<EffectivePermissionRow[]> => {
      const { data, error } = await supabase.rpc(
        "list_user_effective_permissions",
        { _user_id: user!.id },
      );
      if (error) throw error;
      return ((data ?? []) as EffectiveRpcRow[]).map((r) => ({
        key: r.permission_key as V2PermissionKey,
        scope: r.scope as PermissionScope,
        source: r.source === "role" ? "role" : "override",
      }));
    },
  });

  return useMemo(() => {
    const effective = effectiveQuery.data ?? [];
    const can = (key: V2PermissionKey, scope: PermissionScope = "own") => {
      if (isAdmin) return true;
      return hasModuleScope(effective, key, scope);
    };
    const bestScope = (key: V2PermissionKey) => {
      if (isAdmin) return "all" as PermissionScope;
      return bestScopeFn(effective, key);
    };
    return {
      isAdmin,
      role: roleQuery.data ?? null,
      effective,
      loading: authLoading || roleQuery.isLoading || effectiveQuery.isLoading,
      can,
      bestScope,
    };
  }, [authLoading, effectiveQuery.data, effectiveQuery.isLoading, isAdmin, roleQuery.data, roleQuery.isLoading]);
}

/** Convenience: single-permission check. */
export function useCan(
  key: V2PermissionKey,
  scope: PermissionScope = "own",
): { loading: boolean; allowed: boolean } {
  const { loading, can } = useMyPermissionsV2();
  return { loading, allowed: can(key, scope) };
}
