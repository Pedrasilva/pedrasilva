import { useEffect, useRef } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkFinanceAccess } from "@/lib/finance/access";
import { useAuth } from "@/hooks/use-auth";

export const FINANCE_ACCESS_KEY = "finance-access" as const;

/**
 * Shared query options — used by both the nav (useFinanceAccess) and the
 * /finance route guard (ensureQueryData) so they always agree.
 */
export const financeAccessQueryOptions = (userId: string | null | undefined) =>
  queryOptions({
    queryKey: [FINANCE_ACCESS_KEY, userId ?? null],
    queryFn: () => checkFinanceAccess(),
    staleTime: 5 * 60 * 1000,
  });

/**
 * Returns `true` only once finance access has been positively confirmed.
 * Loading, error and denied states all return `false` (fail closed).
 */
export function useFinanceAccess(): { hasAccess: boolean; isLoading: boolean } {
  const { user, viewAsUser, viewAsCollaboratorId } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  // Invalidate on View As changes and drop cached results on sign-out.
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

  const q = useQuery({ ...financeAccessQueryOptions(userId), enabled: !!userId });
  return { hasAccess: q.data === true, isLoading: q.isLoading };
}
