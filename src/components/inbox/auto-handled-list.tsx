/**
 * Auto-handled audit tab — messages a sender rule resolved without human
 * review. Each row stays undoable indefinitely (not an 8-second window):
 * `undoEmailEventAction` reverses the Gmail side effect and re-queues the row.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listAutoHandledEmailEvents,
  undoEmailEventAction,
  type AutoHandledEmailEvent,
} from "@/lib/inbox/inbox.functions";

export function AutoHandledList() {
  const { t } = useTranslation(["inbox"]);
  const listFn = useServerFn(listAutoHandledEmailEvents);

  const q = useQuery({
    queryKey: ["email-events", "auto-handled"],
    queryFn: () => listFn(),
  });

  if (q.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{t("inbox:list.loading")}</p>
    );
  }
  if (q.isError) {
    return (
      <Card className="p-10 text-center text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : t("inbox:queue.loadError")}
      </Card>
    );
  }

  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-medium">{t("inbox:auto.emptyTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("inbox:auto.emptySub")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("inbox:auto.count", { count: rows.length })}
      </p>
      {rows.map((row) => (
        <AutoHandledRow key={row.id} row={row} />
      ))}
    </div>
  );
}

function AutoHandledRow({ row }: { row: AutoHandledEmailEvent }) {
  const { t } = useTranslation(["inbox"]);
  const qc = useQueryClient();
  const undoFn = useServerFn(undoEmailEventAction);

  const undoM = useMutation({
    mutationFn: () => undoFn({ data: { id: row.id } }),
    onSuccess: () => {
      toast.success(t("inbox:queue.undone"));
      void qc.invalidateQueries({ queryKey: ["email-events"] });
    },
    onError: (e: unknown) =>
      toast.error(t("inbox:queue.undoFailed"), {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  return (
    <Card className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {row.subject || t("inbox:queue.noSubject")}
        </span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {t(`inbox:status.${row.status}`, { defaultValue: row.status })}
          </Badge>
          {row.category && (
            <Badge variant="outline">
              {t(`inbox:category.${row.category}`, {
                defaultValue: row.category,
              })}
            </Badge>
          )}
          <Badge variant="outline">{t("inbox:auto.badge")}</Badge>
        </div>
        <div className="mt-0.5 break-words text-xs text-muted-foreground">
          {row.from_address ?? "—"}
          {row.reviewed_at
            ? ` · ${new Date(row.reviewed_at).toLocaleString()}`
            : ""}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={undoM.isPending}
        onClick={() => undoM.mutate()}
      >
        {undoM.isPending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Undo2 className="mr-1.5 h-4 w-4" />
        )}
        {t("inbox:auto.undo")}
      </Button>
    </Card>
  );
}
