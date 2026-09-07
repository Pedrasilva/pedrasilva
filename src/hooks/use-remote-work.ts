import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toLocalISODate } from "@/lib/dates";

export type RemoteWorkStatus =
  | "pendente"
  | "aprovada"
  | "rejeitada"
  | "cancelada";

export type RemoteWorkLocation = "home" | "remote";

export type RemoteWorkRequest = {
  id: string;
  collaborator_id: string;
  data: string;
  estado: RemoteWorkStatus;
  location_type: RemoteWorkLocation;
  notas: string | null;
  motivo_rejeicao: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  override_by: string | null;
  request_group_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type RemoteWorkSettings = {
  approval_required: boolean;
  minimum_notice_days: number;
  allow_same_day_requests: boolean;
  allow_admin_override: boolean;
};

export type RemoteWorkApprover = {
  id: string;
  approver_user_id: string;
  collaborator_id: string | null;
  priority: number;
  active: boolean;
};

export const remoteWorkKeys = {
  all: ["remote_work_requests"] as const,
  settings: ["remote_work_settings"] as const,
  approvers: ["remote_work_approvers"] as const,
};

const SELECT_COLS =
  "id, collaborator_id, data, estado, location_type, notas, motivo_rejeicao, aprovado_por, aprovado_em, cancelled_at, cancelled_by, override_by, request_group_id, created_by, created_at";

/** Every request the current user is allowed to see (own + approved + approver scope). */
export function useRemoteWorkRequests() {
  return useQuery<RemoteWorkRequest[]>({
    queryKey: remoteWorkKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remote_work_requests")
        .select(SELECT_COLS)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RemoteWorkRequest[];
    },
  });
}

export function useRemoteWorkSettings() {
  return useQuery<RemoteWorkSettings>({
    queryKey: remoteWorkKeys.settings,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remote_work_settings")
        .select(
          "approval_required, minimum_notice_days, allow_same_day_requests, allow_admin_override",
        )
        .maybeSingle();
      if (error) throw error;
      return (
        (data as RemoteWorkSettings | null) ?? {
          approval_required: true,
          minimum_notice_days: 1,
          allow_same_day_requests: false,
          allow_admin_override: true,
        }
      );
    },
  });
}

export function useUpdateRemoteWorkSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<RemoteWorkSettings>) => {
      const { error } = await supabase
        .from("remote_work_settings")
        .update(patch)
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: remoteWorkKeys.settings }),
  });
}

export function useRemoteWorkApprovers() {
  return useQuery<RemoteWorkApprover[]>({
    queryKey: remoteWorkKeys.approvers,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remote_work_approvers")
        .select("id, approver_user_id, collaborator_id, priority, active")
        .order("priority");
      if (error) throw error;
      return (data ?? []) as RemoteWorkApprover[];
    },
  });
}

export function useSaveRemoteWorkApprover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      approver_user_id?: string;
      collaborator_id?: string | null;
      priority?: number;
      active?: boolean;
    }) => {
      if (input.id) {
        const patch: {
          collaborator_id?: string | null;
          priority?: number;
          active?: boolean;
        } = {};
        if (input.collaborator_id !== undefined)
          patch.collaborator_id = input.collaborator_id;
        if (input.priority !== undefined) patch.priority = input.priority;
        if (input.active !== undefined) patch.active = input.active;

        const { error } = await supabase
          .from("remote_work_approvers")
          .update(patch)
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      if (!input.approver_user_id) throw new Error("Missing approver account");
      const { error } = await supabase
        .from("remote_work_approvers")
        .insert({
          approver_user_id: input.approver_user_id,
          collaborator_id: input.collaborator_id ?? null,
          priority: input.priority ?? 1,
          active: input.active ?? true,
        });
      if (error) throw error;
    },

    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: remoteWorkKeys.approvers }),
  });
}

export function useDeleteRemoteWorkApprover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("remote_work_approvers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: remoteWorkKeys.approvers }),
  });
}

/**
 * Approver resolution: an active approver assigned to this collaborator wins
 * over a global approver; inside each group the lowest `priority` wins.
 */
export function resolveApprover(
  approvers: RemoteWorkApprover[],
  collaboratorId: string | null,
): RemoteWorkApprover | null {
  if (!collaboratorId) return null;
  const active = approvers.filter((a) => a.active);
  const scoped = active
    .filter((a) => a.collaborator_id === collaboratorId)
    .sort((a, b) => a.priority - b.priority);
  if (scoped.length > 0) return scoped[0];
  const global = active
    .filter((a) => a.collaborator_id === null)
    .sort((a, b) => a.priority - b.priority);
  return global[0] ?? null;
}

/** Whether the signed-in user may approve anyone's remote-work requests. */
export function useCanApproveRemoteWork() {
  const { user, isAdmin } = useAuth();
  const { data: approvers = [] } = useRemoteWorkApprovers();
  return useMemo(() => {
    if (isAdmin) return true;
    if (!user) return false;
    return approvers.some((a) => a.active && a.approver_user_id === user.id);
  }, [approvers, isAdmin, user]);
}

export function useCreateRemoteWorkRequests() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      collaboratorId: string;
      dates: string[];
      notas?: string | null;
      locationType?: RemoteWorkLocation;
      /** Skip approval (HR/Admin override). */
      override?: boolean;
    }) => {
      const groupId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : undefined;
      const rows = input.dates.map((d) => ({
        collaborator_id: input.collaboratorId,
        data: d,
        notas: input.notas?.trim() ? input.notas.trim() : null,
        location_type: input.locationType ?? "home",
        request_group_id: groupId,
        created_by: user?.id ?? null,
        ...(input.override
          ? {
              estado: "aprovada",
              aprovado_por: user?.id ?? null,
              aprovado_em: new Date().toISOString(),
              override_by: user?.id ?? null,
            }
          : {}),
      }));
      const { error } = await supabase
        .from("remote_work_requests")
        .insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: remoteWorkKeys.all });
      void qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}

export function useSetRemoteWorkStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      estado,
      approverUserId,
      motivo,
    }: {
      id: string;
      estado: "aprovada" | "rejeitada";
      approverUserId?: string | null;
      motivo?: string | null;
    }) => {
      const { error } = await supabase
        .from("remote_work_requests")
        .update({
          estado,
          aprovado_por: approverUserId ?? null,
          aprovado_em: new Date().toISOString(),
          motivo_rejeicao: motivo?.trim() ? motivo.trim() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: remoteWorkKeys.all });
      void qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}

/** Cancel keeps the historical record — it never deletes the row. */
export function useCancelRemoteWorkRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("remote_work_requests")
        .update({
          estado: "cancelada",
          cancelled_at: new Date().toISOString(),
          cancelled_by: user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: remoteWorkKeys.all });
      void qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}

export type CollaboratorLite = {
  id: string;
  nome: string;
  email: string | null;
  days_per_week: number | null;
};

export function useCollaboratorDirectory() {
  return useQuery<CollaboratorLite[]>({
    queryKey: ["collaborators", "directory-basic"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators_directory")
        .select("id, nome, email, days_per_week")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as CollaboratorLite[];
    },
  });
}

export type UserCollaboratorLink = {
  user_id: string;
  collaborator_id: string | null;
  collaborator_nome: string | null;
  email: string;
};

/** Links Hub accounts to collaborator records (used for approver selection). */
export function useUserCollaboratorLinks() {
  return useQuery<UserCollaboratorLink[]>({
    queryKey: ["remote_work", "user_collaborator_links"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "list_users_with_permissions",
      );
      if (error) throw error;
      return (data ?? []).map((r) => ({
        user_id: r.user_id,
        collaborator_id: r.collaborator_id ?? null,
        collaborator_nome: r.collaborator_nome ?? null,
        email: r.email,
      }));
    },
  });
}


/** The collaborator row that matches the signed-in user's email. */
export function useMyCollaborator() {
  const { user } = useAuth();
  const { data: collaborators = [], isLoading } = useCollaboratorDirectory();
  const collaborator = useMemo(
    () =>
      collaborators.find(
        (c) =>
          c.email &&
          user?.email &&
          c.email.toLowerCase() === user.email.toLowerCase(),
      ) ?? null,
    [collaborators, user],
  );
  return { collaborator, collaborators, isLoading };
}

export const todayISO = () => toLocalISODate(new Date());

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

/**
 * Notice-rule check. Returns an error key when the date is not allowed.
 */
export function validateNotice(
  date: string,
  settings: RemoteWorkSettings,
  opts: { override?: boolean } = {},
): "sameDay" | "notice" | null {
  if (opts.override) return null;
  const today = todayISO();
  const earliest = settings.allow_same_day_requests
    ? today
    : addDaysISO(today, Math.max(1, settings.minimum_notice_days || 1));
  if (date < today) return "notice";
  if (date < earliest) return date === today ? "sameDay" : "notice";
  return null;
}
