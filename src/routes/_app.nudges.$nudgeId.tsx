import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMarkNotificationRead, useNotifications } from "@/hooks/use-notifications";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { getNudge, submitNudgeAnswer } from "@/lib/marketing/nudges.functions";
import { blobToBase64 } from "@/lib/projects/wav-encoder";
import { useVoiceRecorder } from "@/components/marketing/use-voice-recorder";

export const Route = createFileRoute("/_app/nudges/$nudgeId")({
  component: NudgeAnswerPage,
  head: () => ({
    meta: [
      { title: "Answer a question · PSA Hub" },
      { name: "description", content: "Tell the marketing team the story behind a project capture." },
      { property: "og:title", content: "Answer a question · PSA Hub" },
      { property: "og:description", content: "Tell the marketing team the story behind a project capture." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function NudgeAnswerPage() {
  const { nudgeId } = Route.useParams();
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const getFn = useServerFn(getNudge);
  const submitFn = useServerFn(submitNudgeAnswer);
  const rec = useVoiceRecorder();
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const key = ["marketing-nudge", nudgeId];
  const { items: notes } = useNotifications();
  const markRead = useMarkNotificationRead();
  useEffect(() => {
    for (const x of notes) if (!x.read_at && x.link_path === `/nudges/${nudgeId}`) markRead.mutate(x.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, nudgeId]);
  const { data: n, isLoading, error } = useQuery({ queryKey: key, queryFn: () => getFn({ data: { nudgeId } }) });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">{t("inbox.loading")}</div>;
  if (error || !n) return <div className="p-6 text-sm text-muted-foreground">{t("nudge.notFound")}</div>;

  const open = n.status === "pending" && !n.expired;
  const state = n.expired ? "expired" : n.status;

  const toggleRec = async () => {
    try {
      if (rec.recording) {
        const wav = await rec.stop();
        if (!wav) toast.error(t("nudge.emptyRecording"));
        setAudio(wav);
      } else await rec.start();
    } catch { toast.error(t("nudge.micError")); }
  };

  const submit = async (dismiss: boolean) => {
    setBusy(true);
    try {
      const audioBase64 = !dismiss && audio ? await blobToBase64(audio) : undefined;
      const r = await submitFn({ data: { nudgeId, dismiss, text: dismiss ? undefined : text, audioBase64, mime: "audio/wav" } });
      toast.success(dismiss ? t("nudge.dismissed") : t("nudge.thanks"));
      if (!dismiss && !r.hasProfile) toast.message(t("nudge.noProfile"));
      setText(""); setAudio(null);
      qc.invalidateQueries({ queryKey: key });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div>
        <p className="text-xs text-muted-foreground">{t("nudge.askedBy", { name: n.senderName })}{n.projectName ? ` · ${n.projectName}` : ""}</p>
        <h1 className="mt-1 text-xl font-semibold">{n.question}</h1>
        <Badge variant="outline" className="mt-2">{t(`nudge.status.${state}`)}</Badge>
        {n.kind === "briefing" && <p className="mt-2 text-sm text-muted-foreground">{t("nudge.briefingHint")}</p>}
      </div>
      {n.images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {n.images.map((src) => <img key={src} src={src} alt="" className="aspect-square w-full rounded object-cover" />)}
        </div>
      )}
      {n.captureText && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.captureText}</p>}

      {open ? (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Button type="button" variant={rec.recording ? "destructive" : "outline"} onClick={toggleRec} disabled={busy}
              aria-label={rec.recording ? t("nudge.stop") : t("nudge.record")}>
              {rec.recording ? <Square className="mr-1 h-4 w-4" /> : <Mic className="mr-1 h-4 w-4" />}
              {rec.recording ? t("nudge.stop") : t("nudge.record")}
            </Button>
            {audio && !rec.recording && (
              <span className="flex items-center gap-2 text-sm">
                <audio controls src={URL.createObjectURL(audio)} className="h-8" />
                <Button size="sm" variant="ghost" onClick={() => setAudio(null)}>{t("nudge.discard")}</Button>
              </span>
            )}
          </div>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("nudge.typePlaceholder")} />
          <div className="flex gap-2">
            <Button onClick={() => submit(false)} disabled={busy || rec.recording || (!text.trim() && !audio)}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("nudge.submit")}
            </Button>
            <Button variant="outline" onClick={() => submit(true)} disabled={busy}>{t("nudge.notRelevant")}</Button>
          </div>
          {busy && audio && <p className="text-xs text-muted-foreground">{t("nudge.transcribing")}</p>}
        </Card>
      ) : (
        n.answer_text && (
          <Card className="space-y-2 p-4">
            <p className="text-xs text-muted-foreground">{t("nudge.yourAnswer")}</p>
            {n.audioUrl && <audio controls src={n.audioUrl} className="w-full" />}
            <p className="whitespace-pre-wrap text-sm">{n.answer_text}</p>
          </Card>
        )
      )}
    </div>
  );
}
