import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Whose permissions the UI should evaluate.
 *  - View As off → the real signed-in user.
 *  - View As on  → the viewed collaborator's login user id (via
 *    get_user_id_for_collaborator). Unresolvable / error → null (fail closed).
 * UI preview only — route guards and RLS always use the real session.
 */
export function useViewAsUserId(): {
  active: boolean;
  userId: string | null;
  loading: boolean;
} {
  const { user, viewAsUser, viewAsCollaboratorId, loading: authLoading } = useAuth();
  const enabled = !!user && viewAsUser && !!viewAsCollaboratorId;
  const q = useQuery({
    queryKey: ["view-as-user-id", user?.id ?? null, viewAsCollaboratorId ?? null],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc("get_user_id_for_collaborator", {
        p_collaborator_id: viewAsCollaboratorId!,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
  if (!viewAsUser) return { active: false, userId: user?.id ?? null, loading: authLoading };
  if (!enabled) return { active: true, userId: null, loading: authLoading };
  return { active: true, userId: q.isError ? null : (q.data ?? null), loading: q.isLoading };
}
