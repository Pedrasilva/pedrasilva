import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NudgePanel } from "@/components/marketing/nudge-panel";
import { useVoiceRecorder } from "@/components/marketing/use-voice-recorder";
import { blobToBase64 } from "@/lib/projects/wav-encoder";
import { addCaptureNote, canAddCaptureNote, deleteCaptureNote, listCaptureNotes } from "@/lib/marketing/capture-notes.functions";

const MAX_SECONDS = 600;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Capture drawer "Context" card: record/type a note (allowed people) + ask an architect (curators). */
export function CaptureContextCard({ captureId, hasProfile, profileId, canCurate }: {
  captureId: string; hasProfile: boolean; profileId: string | null; canCurate: boolean;
}) {
  const { t, i18n } = useTranslation("marketing");
  const qc = useQueryClient();
  const canFn = useServerFn(canAddCaptureNote);
  const listFn = useServerFn(listCaptureNotes);
  const addFn = useServerFn(addCaptureNote);
  const delFn = useServerFn(deleteCaptureNote);
  const rec = useVoiceRecorder();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const key = ["marketing-capture-notes", captureId];
  const { data: perm } = useQuery({ queryKey: ["marketing-capture-note-can", captureId], queryFn: () => canFn({ data: { captureId } }) });
  const { data: list } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { captureId } }) });
  const notes = list?.notes ?? [];
  const allowed = !!perm?.allowed;

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const stopRec = async () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    const wav = await rec.stop();
    if (!wav) toast.error(t("nudge.emptyRecording"));
    setAudio(wav);
  };
  const toggleRec = async () => {
    try {
      if (rec.recording) return await stopRec();
      setAudio(null); setSecs(0);
      await rec.start();
      const started = Date.now();
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        setSecs(s);
        if (s >= MAX_SECONDS) void stopRec();
      }, 500);
    } catch { toast.error(t("nudge.micError")); }
  };

  const reset = () => { setOpen(false); setTyping(false); setText(""); setAudio(null); setSecs(0); };

  const save = async () => {
    setBusy(true);
    try {
      const audioBase64 = audio ? await blobToBase64(audio) : undefined;
      const r = await addFn({ data: { captureId, text: text.trim() || undefined, audioBase64, mime: "audio/wav" } });
      toast.success(t("context.saved"));
      if (r.reanalysed) toast.message(t("context.reanalysed"));
      reset();
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["marketing-captures"] });
      qc.invalidateQueries({ queryKey: ["marketing-story-suggestions"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t("context.deleteConfirm"))) return;
    try { await delFn({ data: { noteId: id } }); qc.invalidateQueries({ queryKey: key }); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const recordBtn = allowed && !open ? (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
      <Mic className="mr-1 h-4 w-4" aria-hidden />{t("context.record")}
    </Button>
  ) : null;

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border p-3">
      <h3 className="text-sm font-semibold">{t("context.title")}</h3>
      {canCurate ? <NudgePanel captureId={captureId} hasProfile={hasProfile} embedded leading={recordBtn} /> : recordBtn}

      {open && (
        <div className="space-y-2 rounded border border-border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={rec.recording ? "destructive" : "outline"} onClick={toggleRec} disabled={busy}>
              {rec.recording ? <Square className="mr-1 h-4 w-4" /> : <Mic className="mr-1 h-4 w-4" />}
              {rec.recording ? t("nudge.stop") : t("nudge.record")}
            </Button>
            {(rec.recording || secs > 0) && (
              <span className="text-xs tabular-nums text-muted-foreground">{fmt(secs)} / {fmt(MAX_SECONDS)}</span>
            )}
            {audio && !rec.recording && (
              <>
                <audio controls src={URL.createObjectURL(audio)} className="h-8" />
                <Button size="sm" variant="ghost" onClick={() => { setAudio(null); setSecs(0); }}>{t("nudge.discard")}</Button>
              </>
            )}
            {!typing && <Button size="sm" variant="ghost" onClick={() => setTyping(true)}>{t("context.orType")}</Button>}
          </div>
          {typing && <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("nudge.typePlaceholder")} />}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy || rec.recording || (!text.trim() && !audio)}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("context.save")}
            </Button>
            <Button size="sm" variant="outline" onClick={reset} disabled={busy || rec.recording}>{t("posts.cancel")}</Button>
          </div>
          {busy && audio && <p className="text-xs text-muted-foreground">{t("nudge.transcribing")}</p>}
        </div>
      )}

      {notes.length > 0 && !hasProfile && <p className="text-xs text-amber-700 dark:text-amber-400">{t("nudge.noProfile")}</p>}
      {notes.map((n) => (
        <div key={n.id} className="space-y-1 rounded border border-border p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{n.authorName}</span>
            <span>· {new Date(n.created_at).toLocaleString(i18n.language)}</span>
            {(n.mine || canCurate) && (
              <Button size="icon" variant="ghost" className="ml-auto h-6 w-6" onClick={() => remove(n.id)} aria-label={t("context.delete")}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {n.audioUrl && <audio controls src={n.audioUrl} className="h-8 w-full" />}
          <p className="whitespace-pre-wrap">{n.text}</p>
          {n.story_suggestion_id && profileId && (
            <Link to="/marketing/projects/$profileId" params={{ profileId }} className="text-xs text-primary underline">
              → {t("context.suggestionLink")}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
