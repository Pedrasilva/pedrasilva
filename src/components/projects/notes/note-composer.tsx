import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Square, Loader2, Sparkles, Lock, RotateCcw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from '@/lib/toast';
import { transcribeProjectNote, classifyProjectNote, type ClassifyResult } from "@/lib/projects/notes.functions";
import { useCreateProjectNote, type NoteCategory } from "@/lib/projects/use-project-notes";
import { encodeWav, blobToBase64 } from "@/lib/projects/wav-encoder";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const CATEGORIES: NoteCategory[] = [
  "client_request",
  "todo",
  "issue_risk",
  "decision_fact",
  "project",
  "engineering",
  "status",
  "other",
];

interface Props {
  projectId: string;
  /** "quick" = phone capture page (/m/note); "full" (default) = desktop Notes tab, unchanged. */
  variant?: "full" | "quick";
  /** Quick variant: called after a note is saved. */
  onSaved?: () => void;
}

/** Quick variant recording cap (seconds) and warning point. */
const QUICK_MAX_S = 300;
const QUICK_WARN_S = 270;

export function NoteComposer({ projectId, variant = "full", onSaved }: Props) {
  const { t } = useTranslation("projects");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<ClassifyResult | null>(null);
  const [category, setCategory] = useState<NoteCategory>("other");
  const [confidential, setConfidential] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcribeFailed, setTranscribeFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const quick = variant === "quick";
  const stopRef = useRef<() => void>(() => {});

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const createNote = useCreateProjectNote(projectId);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];
      processor.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      setMicDenied(false);
      setElapsed(0);
      setRecording(true);
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") setMicDenied(true);
      toast.error(t("notes.micError", "Microphone access denied"));
      console.error(err);
    }
  }

  async function stopRecording() {
    const ctx = ctxRef.current;
    const stream = streamRef.current;
    const source = sourceRef.current;
    const processor = processorRef.current;
    if (!ctx || !stream || !source || !processor) return;
    stream.getTracks().forEach((tr) => tr.stop());
    processor.disconnect();
    source.disconnect();
    const chunks = chunksRef.current;
    const sampleRate = ctx.sampleRate;
    await ctx.close();
    ctxRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;
    chunksRef.current = [];
    setRecording(false);

    const wav = encodeWav(chunks, sampleRate);
    if (wav.size < 2048) {
      toast.error(t("notes.emptyRecording", "Recording was empty — try again"));
      return;
    }
    setAudioBlob(wav);
    await transcribeWav(wav);
  }

  /** Transcribe (and classify) a recording; on failure the recording stays in memory for retry. */
  async function transcribeWav(wav: Blob) {
    setTranscribing(true);
    setTranscribeFailed(false);
    try {
      const b64 = await blobToBase64(wav);
      const { text: transcript } = await transcribeProjectNote({
        data: { audioBase64: b64, mimeType: "audio/wav", filename: "note.wav" },
      });
      setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
      if (transcript.trim()) await runClassify(transcript);
    } catch (err) {
      setTranscribeFailed(true);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTranscribing(false);
    }
  }

  stopRef.current = () => { void stopRecording(); };

  // Quick variant: elapsed counter, warning at 4:30, auto-stop at 5:00.
  useEffect(() => {
    if (!quick || !recording) return;
    const started = Date.now();
    let warned = false;
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s >= QUICK_WARN_S && !warned) { warned = true; toast.warning(t("notes.quick.capWarn")); }
      if (s >= QUICK_MAX_S) { window.clearInterval(id); toast.info(t("notes.quick.capReached")); stopRef.current(); }
    }, 500);
    return () => window.clearInterval(id);
  }, [quick, recording, t]);

  async function runClassify(input: string) {
    setClassifying(true);
    try {
      const result = await classifyProjectNote({ data: { text: input } });
      setSuggestion(result);
      setCategory(result.category);
      if (result.confidential) setConfidential(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setClassifying(false);
    }
  }

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      // Ensure we have a classification
      let final = suggestion;
      if (!final) {
        final = await classifyProjectNote({ data: { text } });
      }

      // Upload audio if present
      let audioPath: string | null = null;
      if (audioBlob) {
        const { data: user } = await supabase.auth.getUser();
        const uid = user.user?.id;
        if (uid) {
          const path = `${uid}/${projectId}/${crypto.randomUUID()}.wav`;
          const { error: upErr } = await supabase.storage
            .from("project-note-audio")
            .upload(path, audioBlob, { contentType: "audio/wav" });
          if (!upErr) audioPath = path;
        }
      }

      await createNote.mutateAsync({
        body: text.trim(),
        raw_transcript: audioBlob ? text.trim() : null,
        title: final?.title ?? null,
        category,
        confidential,
        event_date: final?.event_date ?? null,
        entities: final?.entities ?? {},
        source: audioBlob ? "voice" : "typed",
        audio_path: audioPath,
        ai_metadata: final as unknown,
      });

      toast.success(t("notes.saved", "Note saved"));
      setText("");
      setAudioBlob(null);
      setSuggestion(null);
      setCategory("other");
      setConfidential(false);
      setTranscribeFailed(false);
      onSaved?.();
    } catch (err) {
      setSaveFailed(true);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (quick) {
    const mm = Math.floor(elapsed / 60);
    const ss = String(elapsed % 60).padStart(2, "0");
    const busy = transcribing || classifying;
    return (
      <div className="flex flex-col gap-5">
        {micDenied && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">{t("notes.quick.micDeniedTitle")}</p>
            <p className="mt-1">{t("notes.quick.micDeniedBody")}</p>
          </div>
        )}
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={recording ? () => void stopRecording() : startRecording}
            disabled={busy || saving}
            aria-label={recording ? t("notes.stop", "Stop") : t("notes.record", "Record")}
            className={cn(
              "flex h-32 w-32 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 disabled:opacity-50",
              recording ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {busy ? <Loader2 className="h-12 w-12 animate-spin" /> : recording ? <Square className="h-12 w-12" /> : <Mic className="h-12 w-12" />}
          </button>
          <div className="text-center text-sm text-muted-foreground" aria-live="polite">
            {recording ? (
              <span className="font-mono text-lg text-foreground">{mm}:{ss} <span className="text-xs text-muted-foreground">/ 5:00</span></span>
            ) : transcribing ? t("notes.transcribing", "Transcribing…")
              : classifying ? t("notes.aiThinking", "AI classifying…")
              : t("notes.quick.tapToRecord")}
          </div>
          {transcribeFailed && audioBlob && !recording && (
            <Button variant="outline" className="min-h-12 gap-2" onClick={() => void transcribeWav(audioBlob)} disabled={transcribing}>
              <RotateCcw className="h-4 w-4" />{t("notes.quick.retry")}
            </Button>
          )}
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { if (text.trim() && !suggestion && !classifying) runClassify(text); }}
          placeholder={t("notes.quick.transcriptPlaceholder")}
          rows={5}
          className="resize-none text-base"
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">{t("notes.quick.category")}</span>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex min-h-12 items-center justify-between rounded-full border border-primary bg-primary px-4 text-sm text-primary-foreground"
          >
            {t(`notes.category.${category}`)}
            <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
          </button>
          {showMore && (
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.filter((c) => c !== category).map((c) => (
                <button key={c} type="button" onClick={() => { setCategory(c); setShowMore(false); }}
                  className="min-h-12 rounded-full border border-border bg-background px-3 text-sm text-foreground">
                  {t(`notes.category.${c}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-12 items-center justify-between rounded-lg border border-border px-4">
          <Label htmlFor="quick-note-confidential" className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4" />{t("notes.confidential", "Confidential")}
          </Label>
          <Switch id="quick-note-confidential" checked={confidential} onCheckedChange={setConfidential} />
        </div>

        <Button onClick={save} disabled={saving || !text.trim() || recording || busy} className="min-h-14 w-full text-base">
          {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : saveFailed ? <RotateCcw className="mr-2 h-5 w-5" /> : null}
          {saveFailed ? t("notes.quick.retrySave") : t("notes.quick.save")}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("notes.composerTitle", "New note")}</h3>
        <Button
          type="button"
          variant={recording ? "destructive" : "outline"}
          size="sm"
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing || saving}
          className="gap-1.5"
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {recording
            ? t("notes.stop", "Stop")
            : transcribing
            ? t("notes.transcribing", "Transcribing…")
            : t("notes.record", "Record")}
          {transcribing && <Loader2 className="h-4 w-4 animate-spin" />}
        </Button>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() && !suggestion && !classifying) runClassify(text);
        }}
        placeholder={t(
          "notes.placeholder",
          "Type or dictate a note. e.g. 'Client asked to change the roof detail — meeting 21 March'.",
        )}
        rows={4}
        className="resize-none"
      />

      {(suggestion || classifying) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {classifying && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3 animate-pulse" />
              {t("notes.aiThinking", "AI classifying…")}
            </Badge>
          )}
          {suggestion && (
            <>
              <span className="text-xs text-muted-foreground">{t("notes.suggested", "Suggested:")}</span>
              {suggestion.event_date && (
                <Badge variant="outline">{suggestion.event_date}</Badge>
              )}
              {suggestion.entities?.people?.map((p) => (
                <Badge key={`p-${p}`} variant="secondary">@{p}</Badge>
              ))}
              {suggestion.entities?.materials?.map((m) => (
                <Badge key={`m-${m}`} variant="secondary">{m}</Badge>
              ))}
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {t(`notes.category.${c}`)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="note-confidential" className="flex cursor-pointer items-center gap-1.5 text-xs">
            <Lock className="h-3.5 w-3.5" />
            {t("notes.confidential", "Confidential")}
          </Label>
          <Switch id="note-confidential" checked={confidential} onCheckedChange={setConfidential} />
          <Button onClick={save} disabled={saving || !text.trim() || recording}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("notes.save", "Save note")}
          </Button>
        </div>
      </div>
    </div>
  );
}
