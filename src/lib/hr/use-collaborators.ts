import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Collaborator } from "@/lib/salary";

export type ArchiveStatus = "active" | "archived" | "all";

export const collaboratorKeys = {
  all: ["collaborators"] as const,
  list: (opts: { status: ArchiveStatus }) =>
    ["collaborators", "list", opts] as const,
};

/**
 * Lists collaborators filtered by archive status.
 * Default: only active (archived_at IS NULL) for operational use.
 */
export function useCollaboratorsList({
  status = "active",
}: { status?: ArchiveStatus } = {}) {
  return useQuery({
    queryKey: collaboratorKeys.list({ status }),
    queryFn: async () => {
      let q = supabase.from("collaborators").select("*").order("nome");
      if (status === "active") q = q.is("archived_at", null);
      else if (status === "archived") q = q.not("archived_at", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Collaborator[];
    },
  });
}

function invalidateCollaboratorCaches(qc: ReturnType<typeof useQueryClient>) {
  // Cover every place collaborators are queried.
  qc.invalidateQueries({ queryKey: ["collaborators"] });
  qc.invalidateQueries({ queryKey: ["collaborators-existing-list"] });
  qc.invalidateQueries({ queryKey: ["collaborators-picker"] });
  qc.invalidateQueries({ queryKey: ["collaborators-lite"] });
  qc.invalidateQueries({ queryKey: ["admin-users"] });
  qc.invalidateQueries({ queryKey: ["default-rates"] });
}

export function useArchiveCollaborator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("collaborators")
        .update({
          archived_at: new Date().toISOString(),
          archived_by: auth.user?.id ?? null,
          archive_reason: reason?.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      invalidateCollaboratorCaches(qc);
      qc.invalidateQueries({ queryKey: ["collaborator", id] });
    },
  });
}

export function useRestoreCollaborator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("collaborators")
        .update({
          archived_at: null,
          archived_by: null,
          archive_reason: null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      invalidateCollaboratorCaches(qc);
      qc.invalidateQueries({ queryKey: ["collaborator", id] });
    },
  });
}

/**
 * Lightweight reference counts for the archive dialog. Informational only —
 * archive is always allowed. Counts are best-effort; failures fall back to 0.
 */
export function useCollaboratorReferenceCounts(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["collaborator-refs", id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const [snaps, vac, ben] = await Promise.all([
        supabase
          .from("salary_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("collaborator_id", id),
        supabase
          .from("vacation_requests")
          .select("id", { count: "exact", head: true })
          .eq("collaborator_id", id),
        supabase
          .from("benefit_expenses")
          .select("id", { count: "exact", head: true })
          .eq("collaborator_id", id),
      ]);
      return {
        snapshots: snaps.count ?? 0,
        vacations: vac.count ?? 0,
        benefitExpenses: ben.count ?? 0,
      };
    },
  });
}
