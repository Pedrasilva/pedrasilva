/**
 * Project ↔ Quote sync status indicator.
 *
 * Shows whether the project is live-mirroring its source quote. Admin users
 * can toggle pause/resume. When live, edits to the source quote propagate
 * via DB triggers; when paused, the project diverges intentionally.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Link2Off, RefreshCcw } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type SyncStatus = "live" | "paused" | "diverged";

interface Props {
  projectId: string;
  sourceQuoteId: string | null;
  canEdit?: boolean;
}

export function ProjectSyncStatusBadge({ projectId, sourceQuoteId, canEdit = false }: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["pm-project-sync", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("pm_projects")
        .select("sync_status, last_synced_at, quote_id")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data as { sync_status: SyncStatus; last_synced_at: string | null; quote_id: string | null } | null;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: { sync_status?: SyncStatus }) => {
      const { error } = await db.from("pm_projects").update(patch).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-project-sync", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!sourceQuoteId) return null;
  const status: SyncStatus = q.data?.sync_status ?? "live";
  const lastSync = q.data?.last_synced_at;

  const label =
    status === "live"
      ? "Live-synced from quote"
      : status === "paused"
        ? "Sync paused"
        : "Diverged from quote";

  const colorClasses =
    status === "live"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
      : status === "paused"
        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
        : "bg-orange-50 text-orange-700 border-orange-200";

  const Icon = status === "live" ? Link2 : status === "paused" ? Link2Off : RefreshCcw;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${colorClasses}`}
        >
          <Icon className="h-3 w-3" />
          {label}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-1 ml-1 h-4 px-1 text-[10px]"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({ sync_status: status === "live" ? "paused" : "live" })
              }
            >
              {status === "live" ? "Pause" : "Resume"}
            </Button>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div>{label}</div>
          {lastSync && (
            <div className="text-muted-foreground">
              Last sync: {format(new Date(lastSync), "d MMM yyyy HH:mm")}
            </div>
          )}
          <div className="mt-1 text-muted-foreground">
            {status === "live"
              ? "Edits to the source quote auto-update this project."
              : "Edits to the source quote no longer affect this project."}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
