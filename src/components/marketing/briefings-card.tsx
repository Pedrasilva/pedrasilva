import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, RefreshCw, Send, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVoiceRecorder } from "@/components/marketing/use-voice-recorder";
import { blobToBase64 } from "@/lib/projects/wav-encoder";
import { listBriefings, recordBriefing, retryBriefing } from "@/lib/marketing/briefings.functions";
import { DeleteNudgesButton } from "@/components/marketing/delete-nudges-button";
import { supabase } from "@/integrations/supabase/client";
import { listNudgeRecipients, sendNudge, suggestBriefingPrompt } from "@/lib/marketing/nudges.functions";

const MAX_SECONDS = 600;
const MAX_BYTES = 25 * 1024 * 1024;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Pass 6C — private spoken project briefings. Internal context only; never shown in posts. */
export function BriefingsCard({ profileId, projectId, canCurate }: { profileId: string; projectId: string; canCurate: boolean }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const listFn = useServerFn(listBriefings);
  const recordFn = useServerFn(recordBriefing);
  const retryFn = useServerFn(retryBriefing);
  const rec = useVoiceRecorder();
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const key = ["marketing-briefings", profileId];
  const { data: rows = [] } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { profileId } }) });

  const submit = async (blob: Blob, mime: string) => {
    if (blob.size > MAX_BYTES) { toast.error(t("briefings.tooLarge")); return; }
    setBusy(true);
    try {
      await recordFn({ data: { profileId, audioBase64: await blobToBase64(blob), mime } });
      toast.success(t("briefings.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("briefings.error"));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["marketing-story-suggestions", profileId] });
    }
  };

  const stop = async () => {
    const wav = await rec.stop();
    if (wav) await submit(wav, "audio/wav");
  };
  useEffect(() => {
    if (!rec.recording) { setSeconds(0); return; }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [rec.recording]);
  useEffect(() => { if (rec.recording && seconds >= MAX_SECONDS) void stop(); }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    if (rec.recording) return stop();
    try { await rec.start(); } catch { toast.error(t("briefings.micError")); }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{t("briefings.title")}</h2>
        <div className="ml-auto flex gap-2">
          {canCurate && <Button size="sm" variant="outline" onClick={() => setAskOpen(true)}><Send className="mr-1 h-3.5 w-3.5" />{t("briefings.ask")}</Button>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("briefings.hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={rec.recording ? "destructive" : "default"} onClick={toggle} disabled={busy}>
          {rec.recording ? <Square className="mr-1 h-3.5 w-3.5" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
          {rec.recording ? t("briefings.stop") : t("briefings.record")}
        </Button>
        {rec.recording && <span className="text-sm tabular-nums">{fmt(seconds)} / {fmt(MAX_SECONDS)}</span>}
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy || rec.recording}>
          <Upload className="mr-1 h-3.5 w-3.5" />{t("briefings.upload")}
        </Button>
        <input ref={fileRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void submit(f, f.type || "audio/mp4"); }} />
        {busy && <span className="flex items-center text-xs text-muted-foreground"><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />{t("briefings.processing")}</span>}
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("briefings.empty")}</p> : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li key={b.id} className="space-y-1 rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{b.recordedByName} · {new Date(b.created_at).toLocaleString()}</span>
                <Badge variant="outline">{t(`briefings.status.${b.status}`)}</Badge>
                {b.fromRequest && <Badge variant="secondary">{t("briefings.fromRequest")}</Badge>}
                {canCurate && b.status === "failed" && (
                  <Button size="sm" variant="ghost" className="h-6" onClick={async () => {
                    try { await retryFn({ data: { briefingId: b.id } }); } catch (e) { toast.error(e instanceof Error ? e.message : t("briefings.error")); }
                    qc.invalidateQueries({ queryKey: key });
                  }}><RefreshCw className="mr-1 h-3 w-3" />{t("briefings.retry")}</Button>
                )}
              </div>
              {b.audioUrl && <audio controls src={b.audioUrl} className="h-8 w-full" />}
              {b.error && <p className="text-xs text-destructive">{b.error}</p>}
              {b.transcript && <details><summary className="cursor-pointer text-xs text-primary">{t("briefings.transcript")}</summary><p className="whitespace-pre-wrap pt-1">{b.transcript}</p></details>}
            </li>
          ))}
        </ul>
      )}
      {canCurate && <BriefingRequests projectId={projectId} />}
      {askOpen && <AskBriefingDialog projectId={projectId} onClose={() => setAskOpen(false)} />}
    </Card>
  );
}

function AskBriefingDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useTranslation("marketing");
  const recipientsFn = useServerFn(listNudgeRecipients);
  const suggestFn = useServerFn(suggestBriefingPrompt);
  const sendFn = useServerFn(sendNudge);
  const { data: rec } = useQuery({ queryKey: ["marketing-briefing-recipients", projectId], queryFn: () => recipientsFn({ data: { projectId } }) });
  const { data: sug } = useQuery({ queryKey: ["marketing-briefing-prompt", projectId], queryFn: () => suggestFn({ data: { projectId } }) });
  const [to, setTo] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [channel, setChannel] = useState<"hub" | "email">("hub");
  const [busy, setBusy] = useState(false);
  const q = question ?? sug?.question ?? "";
  const send = async () => {
    setBusy(true);
    try {
      await sendFn({ data: { kind: "briefing", projectId, architectUserId: to, question: q, aiSuggestedQuestion: sug?.question ?? "", channel, expiresInDays: 14 } });
      toast.success(t("briefings.asked"));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("briefings.error"));
    } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("briefings.ask")}</DialogTitle></DialogHeader>
        <Label>{t("briefings.askTo")}</Label>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger><SelectValue placeholder={t("briefings.askToPlaceholder")} /></SelectTrigger>
          <SelectContent>
            {(rec?.recipients ?? []).map((r) => <SelectItem key={r.userId} value={r.userId}>{r.name}{r.onTeam ? ` · ${t("briefings.onTeam")}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        <Label>{t("briefings.askMessage")}</Label>
        <Textarea rows={4} value={q} onChange={(e) => setQuestion(e.target.value)} placeholder={sug ? "" : t("briefings.drafting")} />
        <Label>{t("briefings.askChannel")}</Label>
        <Select value={channel} onValueChange={(v) => setChannel(v as "hub" | "email")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hub">{t("briefings.channelHub")}</SelectItem>
            <SelectItem value="email">{t("briefings.channelEmail")}</SelectItem>
          </SelectContent>
        </Select>
        <DialogFooter><Button onClick={send} disabled={busy || !to || q.trim().length < 3}>{t("briefings.askSend")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BriefingRequests({ projectId }: { projectId: string }) {
  const { t } = useTranslation("marketing");
  const { data: rows = [] } = useQuery({
    queryKey: ["marketing-briefing-requests", projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("marketing_nudges")
        .select("id, question, status, expires_at, sent_at").eq("project_id", projectId).eq("kind", "briefing")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; question: string; status: string; expires_at: string | null; sent_at: string | null }[];
    },
  });
  if (!rows.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{t("nudge.delete.requests")}</p>
      {rows.map((r) => {
        const st = r.status === "pending" && r.expires_at && new Date(r.expires_at) < new Date() ? "expired" : r.status;
        return (
          <div key={r.id} className="flex items-center gap-2 rounded border border-border p-2 text-sm">
            <Badge variant="outline">{t(`nudge.status.${st}`)}</Badge>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.question}</span>
            <DeleteNudgesButton ids={[r.id]} anyAnswered={r.status === "answered"} />
          </div>
        );
      })}
    </div>
  );
}
