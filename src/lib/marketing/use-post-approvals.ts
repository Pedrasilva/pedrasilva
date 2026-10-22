import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { listMyPostApprovals } from "./post-approvals.functions";

/** Pending post approvals assigned to me; always empty for people without Marketing access. */
export function useMyPostApprovals(enabled = true) {
  const fn = useServerFn(listMyPostApprovals);
  const { user, viewAsUser, loading } = useAuth();
  const q = useQuery({
    queryKey: ["marketing-my-post-approvals", user?.id], enabled: enabled && !!user && !viewAsUser && !loading,
    queryFn: () => fn(), staleTime: 15_000, refetchInterval: 60_000,
  });
  return { ...q, rows: q.data ?? [] };
}
