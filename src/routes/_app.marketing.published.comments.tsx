import { translateError } from '@/lib/translate-error';
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EyeOff, ExternalLink, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from '@/lib/toast';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { isUnread, MAX_REPLY } from "@/lib/marketing/instagram-comments";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { commentActorNames, sendCommentReply, setCommentVisibility, suggestReply, syncCommentsNow } from "@/lib/marketing/instagram-comments.functions";

export const Route = createFileRoute("/_app/marketing/published/comments")({
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="all">
      <CommentsPage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Instagram comments — Portal Pedra Silva" },
      { name: "description", content: "Comments and replies on Pedra Silva Arquitectos Instagram posts, with reviewed replies and hide controls." },
      { property: "og:title", content: "Instagram comments — Portal Pedra Silva" },
      { property: "og:description", content: "Comments and replies on Pedra Silva Arquitectos Instagram posts, with reviewed replies and hide controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Comment = {
  id: string; media_id: string; parent_id: string | null; username: string | null; body: string; commented_at: string | null;
  hidden: boolean; from_us: boolean; media_thumbnail: string | null; media_permalink: string | null; media_caption: string | null; read_at: string | null;
};
type Action = { id: string; comment_id: string; action: "reply" | "hide" | "unhide"; actor_id: string; success: boolean; created_at: string; meta_error_message: string | null };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function useComments() {
  return useQuery({
    queryKey: ["marketing-comments"],
    refetchInterval: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [c, a, s] = await Promise.all([
        sb.from("marketing_ig_comments").select("*").order("commented_at", { ascending: false }).limit(300),
        sb.from("marketing_ig_comment_actions").select("id, comment_id, action, actor_id, success, created_at, meta_error_message").order("created_at", { ascending: false }).limit(500),
        sb.from("marketing_settings").select("instagram_comments_synced_at, instagram_comments_error").eq("id", true).maybeSingle(),
      ]);
      if (c.error) throw c.error;
      return { comments: (c.data ?? []) as Comment[], actions: (a.data ?? []) as Action[], syncedAt: s.data?.instagram_comments_synced_at as string | null, syncError: s.data?.instagram_comments_error as string | null };
    },
  });
}

function CommentsPage() {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const { data, isLoading } = useComments();
  const syncFn = useServerFn(syncCommentsNow);
  const [syncing, setSyncing] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [unreadAtOpen, setUnreadAtOpen] = useState<Set<string> | null>(null);
  const comments = data?.comments ?? [];

  // Remember which comments were new when the page opened, then mark them read.
  useEffect(() => {
    if (!data || unreadAtOpen) return;
    const ids = data.comments.filter(isUnread).map((c) => c.id);
    setUnreadAtOpen(new Set(ids));
    if (ids.length) void (supabase as never as { rpc: (n: string, a: unknown) => Promise<unknown> }).rpc("marketing_mark_comments_read", { _ids: ids })
      .then(() => qc.invalidateQueries({ queryKey: ["marketing-comments-unread"] }));
  }, [data, unreadAtOpen, qc]);

  const replies = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const c of comments) if (c.parent_id) m.set(c.parent_id, [...(m.get(c.parent_id) ?? []), c]);
    for (const l of m.values()) l.sort((a, b) => (a.commented_at ?? "").localeCompare(b.commented_at ?? ""));
    return m;
  }, [comments]);
  const isNew = (c: Comment) => !!unreadAtOpen?.has(c.id);
  const top = comments.filter((c) => !c.parent_id && (!onlyNew || isNew(c) || (replies.get(c.id) ?? []).some(isNew)));

  const refresh = async () => {
    setSyncing(true);
    try { const r = await syncFn(); if (r.error) toast.warning(t(`comments.${r.error}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("posts.error")); }
    setSyncing(false);
    qc.invalidateQueries({ queryKey: ["marketing-comments"] });
    qc.invalidateQueries({ queryKey: ["marketing-comments-unread"] });
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("comments.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("comments.subtitle")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={refresh} disabled={syncing}><RefreshCw className={cn("mr-1 h-4 w-4", syncing && "animate-spin")} />{t("comments.refresh")}</Button>
        <span className="text-xs text-muted-foreground">{data?.syncedAt ? t("comments.lastSync", { when: when(data.syncedAt) }) : t("comments.never")}</span>
        {data?.syncError && <span className="text-xs text-warning">{t(`comments.${data.syncError}`)}</span>}
        <div className="ml-auto flex items-center gap-2"><Switch id="only-new" checked={onlyNew} onCheckedChange={setOnlyNew} /><Label htmlFor="only-new" className="text-sm">{t("comments.filterUnread")}</Label></div>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">{t("common:loading")}</p>}
      {!isLoading && top.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("comments.empty")}</p>}
      <div className="space-y-3">
        {top.map((c) => <CommentCard key={c.id} c={c} replies={replies.get(c.id) ?? []} actions={data?.actions ?? []} isNew={isNew} />)}
      </div>
    </div>
  );
}

function CommentLine({ c, isNew, actions, onToggleHide }: { c: Comment; isNew: boolean; actions: Action[]; onToggleHide?: () => void }) {
  const { t } = useTranslation("marketing");
  const { user } = useAuth();
  const namesFn = useServerFn(commentActorNames);
  const { data: names } = useQuery({ queryKey: ["marketing-comment-actor-names", actions.length], queryFn: () => namesFn(), staleTime: 10 * 60_000, enabled: actions.length > 0 });
  const log = actions.filter((a) => a.comment_id === c.id);
  return (
    <div className={cn("space-y-1", c.hidden && "opacity-60")} data-comment={c.id}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">@{c.username ?? "—"}</span>
        <span className="text-xs text-muted-foreground">{when(c.commented_at)}</span>
        {isNew && <Badge className="px-1.5 py-0 text-[10px]">{t("comments.new")}</Badge>}
        {c.hidden && <Badge variant="outline" className="px-1.5 py-0 text-[10px]"><EyeOff className="mr-1 h-3 w-3" />{t("comments.hidden")}</Badge>}
        {c.from_us && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{t("comments.ours")}</Badge>}
        {onToggleHide && !c.from_us && <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onToggleHide}>{c.hidden ? t("comments.unhide") : t("comments.hide")}</Button>}
      </div>
      <p className="whitespace-pre-wrap text-sm">{c.body}</p>
      {log.length > 0 && <ul className="space-y-0.5 text-[11px] text-muted-foreground">{log.map((a) => (
        <li key={a.id} className={cn("flex items-center gap-1", !a.success && "text-destructive")}>{a.actor_id !== user?.id && names?.[a.actor_id]?.name && <CollaboratorAvatar fotoPath={names[a.actor_id].fotoPath} name={names[a.actor_id].name} size={16} />}<span>{t("comments.historyItem", { action: t(`comments.act.${a.action}`), who: a.actor_id === user?.id ? "✓" : names?.[a.actor_id]?.name ?? a.actor_id.slice(0, 8), when: when(a.created_at) })}{!a.success && ` · ${t("comments.failed")}: ${translateError(a.meta_error_message ?? "")}`}</span></li>
      ))}</ul>}
    </div>
  );
}

function CommentCard({ c, replies, actions, isNew }: { c: Comment; replies: Comment[]; actions: Action[]; isNew: (c: Comment) => boolean }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const suggestFn = useServerFn(suggestReply);
  const sendFn = useServerFn(sendCommentReply);
  const hideFn = useServerFn(setCommentVisibility);
  const [text, setText] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [busy, setBusy] = useState<"suggest" | "send" | null>(null);
  const [confirmHide, setConfirmHide] = useState<Comment | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: ["marketing-comments"] });

  const suggest = async () => {
    setBusy("suggest");
    try { const r = await suggestFn({ data: { commentId: c.id } }); if (r.error) toast.error(r.error); else { setText(r.text); setAiUsed(true); } }
    catch (e) { toast.error(e instanceof Error ? e.message : t("posts.error")); }
    setBusy(null);
  };
  const send = async () => {
    setBusy("send");
    try {
      const r = await sendFn({ data: { commentId: c.id, message: text, aiSuggested: aiUsed } });
      if (r.ok) { toast.success(t("comments.sent")); setText(""); setAiUsed(false); } else toast.error(r.error);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("posts.error")); }
    setBusy(null); reload();
  };
  const doHide = async () => {
    if (!confirmHide) return;
    const target = confirmHide; setConfirmHide(null);
    try { const r = await hideFn({ data: { commentId: target.id, hide: !target.hidden } }); if (r.ok) toast.success(t("comments.done")); else toast.error(r.error); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("posts.error")); }
    reload();
  };

  return (
    <Card className="flex gap-3 p-3">
      <a href={c.media_permalink ?? undefined} target="_blank" rel="noreferrer" className="block h-20 w-15 shrink-0 overflow-hidden rounded bg-muted" aria-label={t("comments.openPost")}>
        {c.media_thumbnail && <img src={c.media_thumbnail} alt="" loading="lazy" className="aspect-[3/4] h-full w-full object-cover" />}
      </a>
      <div className="min-w-0 flex-1 space-y-2">
        {c.media_permalink && <a href={c.media_permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" />{t("comments.openPost")}</a>}
        <CommentLine c={c} isNew={isNew(c)} actions={actions} onToggleHide={() => setConfirmHide(c)} />
        {replies.length > 0 && <div className="space-y-2 border-l-2 pl-3">{replies.map((r) => <CommentLine key={r.id} c={r} isNew={isNew(r)} actions={actions} onToggleHide={() => setConfirmHide(r)} />)}</div>}
        <div className="space-y-1.5">
          <Textarea rows={2} value={text} maxLength={MAX_REPLY} placeholder={t("comments.replyPlaceholder")} onChange={(e) => setText(e.target.value)} className="field-sizing-content min-h-16 text-sm" />
          {aiUsed && <p className="text-[11px] text-muted-foreground">{t("comments.suggestHint")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={suggest} disabled={!!busy}><Sparkles className="mr-1 h-4 w-4" />{t("comments.suggest")}</Button>
            <Button size="sm" onClick={send} disabled={!!busy || !text.trim()}><Send className="mr-1 h-4 w-4" />{busy === "send" ? t("comments.sending") : t("comments.send")}</Button>
          </div>
        </div>
      </div>
      <AlertDialog open={!!confirmHide} onOpenChange={(v) => !v && setConfirmHide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmHide?.hidden ? t("comments.unhideTitle") : t("comments.hideTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{confirmHide?.hidden ? t("comments.unhideBody") : t("comments.hideBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="line-clamp-3 text-sm">@{confirmHide?.username}: {confirmHide?.body}</p>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doHide}>{t("comments.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
