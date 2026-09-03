import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISODate } from "@/lib/dates";

export type RemoteWorkStatus = "pendente" | "aprovada" | "rejeitada";

export type RemoteWorkRequest = {
  id: string;
  collaborator_id: string;
  data: string;
  estado: RemoteWorkStatus;
  notas: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
};

export const remoteWorkKeys = {
  all: ["remote_work_requests"] as const,
};

/** Every request the current user is allowed to see (own + approved + approver scope). */
export function useRemoteWorkRequests() {
  return useQuery<RemoteWorkRequest[]>({
    queryKey: remoteWorkKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remote_work_requests")
        .select("*")
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RemoteWorkRequest[];
    },
  });
}

export function useCreateRemoteWorkRequests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      collaboratorId: string;
      dates: string[];
      notas?: string | null;
    }) => {
      const rows = input.dates.map((d) => ({
        collaborator_id: input.collaboratorId,
        data: d,
        notas: input.notas?.trim() ? input.notas.trim() : null,
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
    }: {
      id: string;
      estado: Exclude<RemoteWorkStatus, "pendente">;
      approverUserId?: string | null;
    }) => {
      const { error } = await supabase
        .from("remote_work_requests")
        .update({
          estado,
          aprovado_por: approverUserId ?? null,
          aprovado_em: new Date().toISOString(),
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

export function useDeleteRemoteWorkRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("remote_work_requests")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: remoteWorkKeys.all });
      void qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}

export const todayISO = () => toLocalISODate(new Date());
