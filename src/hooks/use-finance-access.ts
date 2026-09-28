import { useEffect, useRef } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkFinanceAccess, checkFinanceAccessFor } from "@/lib/finance/access";
import { useViewAsUserId } from "@/hooks/use-view-as-user-id";
import { useAuth } from "@/hooks/use-auth";

export const FINANCE_ACCESS_KEY = "finance-access" as const;

/**
 * Shared query options for the REAL signed-in user — used by the /finance
 * route guard (fetchQuery). Unchanged by View As.
 */
export const financeAccessQueryOptions = (userId: string | null | undefined) =>
  queryOptions({
    queryKey: [FINANCE_ACCESS_KEY, userId ?? null],
    queryFn: () => checkFinanceAccess(),
    staleTime: (q) => (q.state.data === true ? 5 * 60 * 1000 : 0),
  });

/** Query options for a View As preview: evaluates the viewed person's user id. */
const financeAccessViewAsQueryOptions = (
  realUserId: string | null,
  targetUserId: string | null,
) =>
  queryOptions({
    queryKey: [FINANCE_ACCESS_KEY, realUserId, "view-as", targetUserId],
    // Unresolved viewed id → fail closed.
    queryFn: () => (targetUserId ? checkFinanceAccessFor(targetUserId) : Promise.resolve(false)),
    staleTime: (q) => (q.state.data === true ? 5 * 60 * 1000 : 0),
  });

/**
 * Returns `true` only once finance access has been positively confirmed.
 * With View As active, evaluates the viewed person (nav preview only; the
 * /finance route guard always checks the real user).
 * Loading, error and denied states all return `false` (fail closed).
 */
export function useFinanceAccess(): { hasAccess: boolean; isLoading: boolean } {
  const { user, viewAsUser, viewAsCollaboratorId } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  // Drop cached results on sign-out; invalidate on View As changes.
  const prev = useRef({ userId, viewAsUser, viewAsCollaboratorId });
  useEffect(() => {
    const p = prev.current;
    if (p.userId && !userId) {
      qc.removeQueries({ queryKey: [FINANCE_ACCESS_KEY] });
    } else if (
      p.viewAsUser !== viewAsUser ||
      p.viewAsCollaboratorId !== viewAsCollaboratorId
    ) {
      qc.invalidateQueries({ queryKey: [FINANCE_ACCESS_KEY] });
    }
    prev.current = { userId, viewAsUser, viewAsCollaboratorId };
  }, [userId, viewAsUser, viewAsCollaboratorId, qc]);

  const { active: viewAsActive, userId: targetId, loading: targetLoading } = useViewAsUserId();
  const opts = viewAsActive
    ? financeAccessViewAsQueryOptions(userId, targetId)
    : financeAccessQueryOptions(userId);
  const q = useQuery({ ...opts, enabled: !!userId && !targetLoading });
  return { hasAccess: q.data === true, isLoading: targetLoading || q.isLoading };
}
