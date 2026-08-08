/**
 * Inbox review queue — every Gmail-visible action here is one explicit click
 * on one row. No batch actions, no automatic sends or archives.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  Tag,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  approveAndSendReply,
  archiveEmailEvent,
  listPendingEmailEvents,
  resolveEmailEventWithoutGmail,
  type PendingEmailEvent,
} from "@/lib/inbox/inbox.functions";

export const Route = createFileRoute("/_app/inbox/")({
  component: InboxTriagePage,
});

function InboxTriagePage() {
  const { t } = useTranslation(["inbox", "common"]);
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingEmailEvents);
  const [openId, setOpenId] = useState<string | null>(null);

  const eventsQ = useQuery({
    queryKey: ["email-events", "pending"],
    queryFn: () => listFn(),
  });

  if (eventsQ.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{t("inbox:list.loading")}</p>
    );
  }

  if (eventsQ.isError) {
    return (
      <Card className="p-10 text-center text-sm text-destructive">
        {eventsQ.error instanceof Error
          ? eventsQ.error.message
          : t("inbox:queue.loadError")}
      </Card>
    );
  }

  const rows = eventsQ.data ?? [];

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-medium">{t("inbox:queue.emptyTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("inbox:queue.emptySub")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("inbox:queue.count", { count: rows.length })}
      </p>
      {rows.map((row) => (
        <EmailRow
          key={row.id}
          row={row}
          open={openId === row.id}
          onToggle={() => setOpenId(openId === row.id ? null : row.id)}
          onDone={() =>
            void qc.invalidateQueries({ queryKey: ["email-events"] })
          }
        />
      ))}
    </div>
  );
}

function EmailRow({
  row,
  open,
  onToggle,
  onDone,
}: {
  row: PendingEmailEvent;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(["inbox", "common"]);
  const [draft, setDraft] = useState(row.draft_reply ?? "");
  const [error, setError] = useState<string | null>(null);

  const sendFn = useServerFn(approveAndSendReply);
  const archiveFn = useServerFn(archiveEmailEvent);
  const resolveFn = useServerFn(resolveEmailEventWithoutGmail);

  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));

  const sendM = useMutation({
    mutationFn: () => sendFn({ data: { id: row.id, body: draft } }),
    onMutate: () => setError(null),
    onSuccess: onDone,
    onError: fail,
  });
  const archiveM = useMutation({
    mutationFn: () => archiveFn({ data: { id: row.id } }),
    onMutate: () => setError(null),
    onSuccess: onDone,
    onError: fail,
  });
  const labelM = useMutation({
    mutationFn: () => resolveFn({ data: { id: row.id, status: "labeled" } }),
    onMutate: () => setError(null),
    onSuccess: onDone,
    onError: fail,
  });
  const rejectM = useMutation({
    mutationFn: () => resolveFn({ data: { id: row.id, status: "rejected" } }),
    onMutate: () => setError(null),
    onSuccess: onDone,
    onError: fail,
  });

  const busy =
    sendM.isPending ||
    archiveM.isPending ||
    labelM.isPending ||
    rejectM.isPending;

  const canSend = row.suggested_action === "reply" && !!row.draft_reply;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">
              {row.subject || t("inbox:queue.noSubject")}
            </span>
            {row.category && (
              <Badge variant="secondary">
                {t(`inbox:category.${row.category}`, {
                  defaultValue: row.category,
                })}
              </Badge>
            )}
            {row.suggested_action && (
              <Badge variant="outline">
                {t(`inbox:action.${row.suggested_action}`, {
                  defaultValue: row.suggested_action,
                })}
              </Badge>
            )}
            {typeof row.confidence === "number" && (
              <span className="text-xs text-muted-foreground">
                {t("inbox:list.confidence")}: {Math.round(row.confidence * 100)}%
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.from_address ?? "—"}
            {row.received_at
              ? ` · ${new Date(row.received_at).toLocaleString()}`
              : ""}
          </div>
          {row.snippet && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {row.snippet}
            </p>
          )}
        </div>
      </button>

      {open && (
        <CardContent className="space-y-4 border-t pt-4">
          {row.draft_reply !== null ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`draft-${row.id}`}>
                {t("inbox:queue.draftReply")}
              </label>
              <Textarea
                id={`draft-${row.id}`}
                rows={8}
                className="w-full max-w-none"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("inbox:queue.draftHint")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("inbox:queue.noDraft")}
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{t("inbox:queue.actionFailed")}</p>
                <p className="text-xs">{error}</p>
              </div>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {canSend && (
              <Button
                size="sm"
                disabled={busy || !draft.trim()}
                onClick={() => sendM.mutate()}
              >
                {sendM.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                {t("inbox:queue.approveSend")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => archiveM.mutate()}
            >
              {archiveM.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-1.5 h-4 w-4" />
              )}
              {t("inbox:queue.archive")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => labelM.mutate()}
            >
              {labelM.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Tag className="mr-1.5 h-4 w-4" />
              )}
              {t("inbox:queue.labelOnly")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => rejectM.mutate()}
            >
              {rejectM.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-1.5 h-4 w-4" />
              )}
              {t("inbox:queue.reject")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("inbox:queue.actionsNote")}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
