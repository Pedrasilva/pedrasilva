import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Notification centre data layer.
 *
 * `notifications` rows are produced server-side (triggers + the hourly
 * `reminders_promote_due` job) and are readable only by their owner via RLS,
 * so the client simply reads its own inbox.
 */
export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link_path: string | null;
  module: string | null;
  entity_type: string | null;
  entity_id: string | null;
  reminder_id: string | null;
  read_at: string | null;
  created_at: string;
};

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => ["notifications", "list"] as const,
};

export function useNotifications(limit = 30) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: notificationKeys.list(),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, kind, title, body, link_path, module, entity_type, entity_id, reminder_id, read_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });

  // Live updates so a reminder promoted by the hourly job lands without reload.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: notificationKeys.all });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  const items = query.data ?? [];
  const unreadCount = items.filter((n) => !n.read_at).length;

  return { ...query, items, unreadCount };
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
