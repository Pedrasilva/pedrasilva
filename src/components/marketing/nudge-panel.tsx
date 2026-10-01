import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircleQuestion, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeleteNudgesButton } from "@/components/marketing/delete-nudges-button";
import { listNudgeRecipients, sendNudge, suggestNudgeQuestion } from "@/lib/marketing/nudges.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type NudgeRow = {
  id: string; architect_user_id: string; question: string; channel: string; status: string;
  answer_text: string | null; answered_at: string | null; expires_at: string | null; created_at: string;
  story_suggestion_id: string | null; project_id: string | null;
};

/** Curator panel in the capture drawer: ask an architect for context, and see nudge states. */
export function NudgePanel({ captureId, hasProfile }: { captureId: string; hasProfile: boolean }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const suggestFn = useServerFn(suggestNudgeQuestion);
  const listFn = useServerFn(listNudgeRecipients);
  const sendFn = useServerFn(sendNudge);
  const [open, setOpen] = useState(false);
  const [architect, setArchitect] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [channel, setChannel] = useState<"hub" | "email" | "whatsapp">("hub");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  const key = ["marketing-nudges", captureId];
  const { data: nudges = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db.from("marketing_nudges").select("*").eq("capture_id", captureId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NudgeRow[];
    },
  });
  const { data: people } = useQuery({
    queryKey: ["marketing-nudge-recipients", captureId],
    enabled: open,
    queryFn: () => listFn({ data: { captureId } }),
  });
  const recipients = (people?.recipients ?? []).filter((r) => r.userId !== people?.senderUserId);
  const hasTeam = recipients.some((r) => r.onTeam);
  const nameOf = (id: string) => (people?.recipients ?? []).find((r) => r.userId === id)?.name ?? "—";

  const draft = async () => {
    setDrafting(true);
    try {
      const { question: q } = await suggestFn({ data: { captureId } });
      setQuestion(q); setAiQuestion(q);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setDrafting(false); }
  };

  const openForm = () => {
    setOpen(true);
    if (!question) void draft();
  };

  const send = async () => {
    if (!architect || !question.trim()) return;
    setSending(true);
    try {
      await sendFn({ data: { captureId, architectUserId: architect, question: question.trim(), aiSuggestedQuestion: aiQuestion, channel, expiresInDays: 7 } });
      toast.success(t("nudge.sent"));
      setOpen(false); setQuestion(""); setAiQuestion(""); setArchitect("");
      qc.invalidateQueries({ queryKey: key });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setSending(false); }
  };

  const stateOf = (n: NudgeRow) =>
    n.status === "pending" && n.expires_at && new Date(n.expires_at) < new Date() ? "expired" : n.status;

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircleQuestion className="h-4 w-4" aria-hidden />{t("nudge.title")}
        </h3>
        {!open && <Button size="sm" variant="outline" onClick={openForm}>{t("nudge.ask")}</Button>}
      </div>

      {open && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("nudge.architect")}</Label>
            <Select value={architect} onValueChange={setArchitect}>
              <SelectTrigger><SelectValue placeholder={t("nudge.pickArchitect")} /></SelectTrigger>
              <SelectContent>
                {recipients.map((r) => (
                  <SelectItem key={r.userId} value={r.userId}>{r.name}{r.onTeam ? ` · ${t("nudge.onTeam")}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {people && !hasTeam && <p className="text-xs text-muted-foreground">{t("nudge.noTeam")}</p>}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>{t("nudge.question")}</Label>
              <Button size="sm" variant="ghost" onClick={draft} disabled={drafting} aria-label={t("nudge.suggest")}>
                {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">{t("nudge.suggest")}</span>
              </Button>
            </div>
            <Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={drafting ? t("nudge.drafting") : ""} />
          </div>
          <div className="space-y-1">
            <Label>{t("nudge.channel")}</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hub">{t("channel.hub")}</SelectItem>
                <SelectItem value="email">{t("channel.email")}</SelectItem>
                <SelectItem value="whatsapp" disabled>{t("channel.whatsapp")} · {t("nudge.comingSoon")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={send} disabled={sending || !architect || !question.trim()}>
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}{t("nudge.send")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>{t("posts.cancel")}</Button>
          </div>
        </div>
      )}

      {nudges.map((n) => {
        const st = stateOf(n);
        return (
          <div key={n.id} className="space-y-1 rounded border border-border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(`nudge.status.${st}`)}</Badge>
              <span className="text-xs text-muted-foreground">{people ? nameOf(n.architect_user_id) : ""} · {t(`channel.${n.channel}`)}</span>
              <span className="ml-auto"><DeleteNudgesButton ids={[n.id]} anyAnswered={n.status === "answered"} /></span>
            </div>
            <p className="text-muted-foreground">{n.question}</p>
            {n.answer_text && <p className="whitespace-pre-wrap">{n.answer_text}</p>}
            {n.status === "answered" && !n.story_suggestion_id && !hasProfile && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{t("nudge.noProfile")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
