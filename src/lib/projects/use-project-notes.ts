import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProjectNote = Database["public"]["Tables"]["pm_project_notes"]["Row"];
export type NoteCategory =
  | "client_request"
  | "todo"
  | "issue_risk"
  | "decision_fact"
  | "project"
  | "engineering"
  | "status"
  | "other";

export function useProjectNotes(projectId: string) {
  return useQuery({
    queryKey: ["project-notes", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_project_notes")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectNote[];
    },
    enabled: !!projectId,
  });
}

export function useCreateProjectNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      body: string;
      raw_transcript?: string | null;
      title?: string | null;
      category: NoteCategory;
      confidential: boolean;
      event_date?: string | null;
      entities?: unknown;
      source: "voice" | "typed";
      audio_path?: string | null;
      ai_metadata?: unknown;
      stage_id?: string | null;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("pm_project_notes")
        .insert({
          project_id: projectId,
          author_id: uid,
          body: input.body,
          raw_transcript: input.raw_transcript ?? null,
          title: input.title ?? null,
          category: input.category,
          confidential: input.confidential,
          event_date: input.event_date ?? null,
          entities: (input.entities ?? {}) as never,
          source: input.source,
          audio_path: input.audio_path ?? null,
          ai_metadata: (input.ai_metadata ?? null) as never,
          stage_id: input.stage_id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ProjectNote;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-notes", projectId] });
    },
  });
}

export function useDeleteProjectNote(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from("pm_project_notes")
        .delete()
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-notes", projectId] });
    },
  });
}
