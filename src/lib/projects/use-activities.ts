import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityReply {
  id: string;
  activity_id: string;
  body: string;
  created_at: string;
  author_resource_id: string | null;
  author: { id: string; name: string; color: string } | null;
}

export interface Activity {
  id: string;
  project_id: string;
  stage_id: string | null;
  task_id: string | null;
  title: string;
  body: string | null;
  logged_hours: number;
  logged_date: string | null;
  created_at: string;
  author_resource_id: string | null;
  author: { id: string; name: string; color: string } | null;
  stage: { id: string; name: string; sort_order: number } | null;
  replies: ActivityReply[];
}

export function useProjectActivities(projectId: string) {
  return useQuery({
    queryKey: ["pm-activities", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from("pm_activities")
        .select(
          `id, project_id, stage_id, task_id, title, body, logged_hours, logged_date, created_at, author_resource_id,
           author:pm_resources!pm_activities_author_resource_id_fkey(id, name, color),
           stage:pm_stages(id, name, sort_order),
           replies:pm_activity_replies(id, activity_id, body, created_at, author_resource_id,
             author:pm_resources!pm_activity_replies_author_resource_id_fkey(id, name, color))`,
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Activity[];
    },
  });
}

export function useCreateActivity(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body?: string;
      stage_id?: string | null;
      task_id?: string | null;
      logged_hours?: number;
      logged_date?: string | null;
      author_resource_id?: string | null;
    }) => {
      const { error } = await supabase.from("pm_activities").insert({
        project_id: projectId,
        title: input.title,
        body: input.body ?? null,
        stage_id: input.stage_id ?? null,
        task_id: input.task_id ?? null,
        logged_hours: input.logged_hours ?? 0,
        logged_date: input.logged_date ?? null,
        author_resource_id: input.author_resource_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-activities", projectId] }),
  });
}

export function useCreateReply(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { activity_id: string; body: string; author_resource_id?: string | null }) => {
      const { error } = await supabase.from("pm_activity_replies").insert({
        activity_id: input.activity_id,
        body: input.body,
        author_resource_id: input.author_resource_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-activities", projectId] }),
  });
}

export function useDeleteActivity(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-activities", projectId] }),
  });
}
