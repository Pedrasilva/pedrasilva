import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { toast } from "sonner";
import { Check, Loader2, Mic, Square, Trash2, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDateLocale } from "@/i18n/use-date-locale";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceRecorder } from "@/components/marketing/use-voice-recorder";
import { transcribeProjectNote } from "@/lib/projects/notes.functions";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import { useEnsureStageRow, useUpsertTimesheetCell } from "@/lib/projects/use-timesheet";
import {
  parseTimesheetDictation,
  type AssistantDraft,
  type AssistantResult,
} from "@/lib/projects/timesheet-assistant.functions";
import { cn } from "@/lib/utils";

const NS = "projects";
const k = (s: string) => `timesheetAssistant.${s}`;

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

type Draft = AssistantDraft & { key: string; saved?: boolean };

/** Mic button that records, transcribes and hands the text back. Audio is never stored. */
function MicButton({ onText, size = "lg" }: { onText: (t: string) => void; size?: "lg" | "sm" }) {
  const { t } = useTranslation(NS);
  const rec = useVoiceRecorder();
  const transcribe = useServerFn(transcribeProjectNote);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (rec.recording) {
      const wav = await rec.stop();
      if (!wav) return;
      setBusy(true);
      try {
        const { text } = await transcribe({ data: { audioBase64: await blobToBase64(wav), mimeType: "audio/wav", filename: "hours.wav" } });
        if (text.trim()) onText(text.trim());
      } catch (e) {
        toast.error(t(k("transcribeFailed")), { description: (e as Error).message });
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      await rec.start();
    } catch {
      toast.error(t(k("micBlocked")));
    }
  }
  const big = size === "lg";
  return (
    <Button
      type="button"
      onClick={toggle}
      disabled={busy}
      variant={rec.recording ? "destructive" : big ? "default" : "outline"}
      size={big ? "lg" : "icon"}
      className={cn(big && "h-16 w-16 rounded-full p-0")}
      aria-label={rec.recording ? t(k("stopRecording")) : t(k("startRecording"))}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : rec.recording ? <Square className="h-5 w-5" /> : <Mic className={big ? "h-7 w-7" : "h-4 w-4"} />}
    </Button>
  );
}

export function TimesheetAssistantSheet({
  open,
  onOpenChange,
  weekStart: initialWeek,
  startTyping = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Monday ISO of the target week; defaults to the current week. */
  weekStart?: string;
  startTyping?: boolean;
}) {
  const { t } = useTranslation(NS);
  const isMobile = useIsMobile();
  const locale = useDateLocale();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useProjectsAuth();
  const parse = useServerFn(parseTimesheetDictation);
  const upsert = useUpsertTimesheetCell();
  const ensureRow = useEnsureStageRow();

  const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const lastWeek = format(subWeeks(parseISO(thisWeek), 1), "yyyy-MM-dd");
  const [week, setWeek] = useState(initialWeek ?? thisWeek);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(startTyping);
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setText("");
    setResult(null);
    setDrafts([]);
    setAnswers({});
    setHistory([]);
    setTyping(startTyping);
  }

  async function run(extra: Array<{ q: string; a: string }> = history, done = false) {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const r = await parse({ data: { text, weekStart: week, today: format(new Date(), "yyyy-MM-dd"), answers: extra, done } });
      setResult(r);
      setDrafts(r.entries.map((e, i) => ({ ...e, key: `${Date.now()}-${i}` })));
      setAnswers({});
    } catch (e) {
      toast.error(t(k("parseFailed")), { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function submitAnswers(done = false) {
    if (!result) return;
    const next = [...history, ...result.questions.map((q, i) => ({ q: q.text, a: answers[i] ?? "" })).filter((x) => x.a.trim())];
    setHistory(next);
    void run(next, done);
  }

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(week), i), "yyyy-MM-dd")), [week]);
  const projById = useMemo(() => new Map((result?.projects ?? []).map((p) => [p.id, p])), [result]);

  function existingFor(d: Draft): number {
    if (!result) return 0;
    return result.existing
      .filter((e) => e.date === d.date && (d.entry_type === "project" ? e.entry_type === "project" && e.stage_id === d.stage_id && !!d.stage_id : e.entry_type === "internal" && e.internal_category === d.internal_category))
      .reduce((s, e) => s + e.hours, 0);
  }
  const ready = (d: Draft) => (d.entry_type === "project" ? !!d.project_id && !!d.stage_id : !!d.internal_category) && d.hours > 0;
  const update = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  async function save(list: Draft[]) {
    if (!user || !result) return;
    const { data: wk } = await supabase.from("pm_timesheet_weeks").select("status").eq("user_id", user.id).eq("week_start", week).maybeSingle();
    const st = (wk as { status?: string } | null)?.status;
    if (st === "submitted" || st === "approved") {
      toast.error(t(k("weekLocked")));
      return;
    }
    setSaving(true);
    let total = 0;
    try {
      for (const d of list) {
        if (!ready(d) || d.saved) continue;
        let taskId: string | null = null;
        if (d.entry_type === "project") {
          if (!profile?.resource_id) throw new Error(t(k("noResource")));
          const stage = projById.get(d.project_id!)?.stages.find((s) => s.id === d.stage_id);
          if (!stage) continue;
          taskId = await ensureRow.mutateAsync({ resource_id: profile.resource_id, stage_id: stage.id, stage_start: stage.start_date, stage_end: stage.end_date });
        }
        let q = supabase.from("pm_time_entries").select("id, hours, notes").eq("user_id", user.id).eq("entry_date", d.date).eq("entry_type", d.entry_type);
        q = taskId ? q.eq("task_id", taskId) : q.eq("internal_category", d.internal_category!);
        const { data: ex } = await q.limit(1);
        const cur = (ex?.[0] as { id: string; hours: number; notes: string | null } | undefined) ?? null;
        const time = d.start_time && d.end_time ? `${d.start_time}–${d.end_time} ` : "";
        const note = `${time}${d.note}`.trim();
        await upsert.mutateAsync({
          entry_type: d.entry_type,
          task_id: taskId,
          internal_category: d.entry_type === "internal" ? d.internal_category : null,
          user_id: user.id,
          entry_date: d.date,
          hours: Number(cur?.hours ?? 0) + d.hours,
          notes: [cur?.notes, note].filter((x) => x && x.trim()).join(" · ") || null,
          existing_entry_id: cur?.id ?? null,
          source: "assistant",
        });
        total += d.hours;
        update(d.key, { saved: true });
      }
    } catch (e) {
      toast.error(t(k("saveFailed")), { description: (e as Error).message });
    } finally {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["pm-timesheet-entries"] });
    }
    if (total > 0) {
      toast.success(t(k("saved"), { hours: total }), {
        action: { label: t(k("openTimesheet")), onClick: () => navigate({ to: "/projects/timesheet" }) },
      });
    }
  }

  const grouped = days.map((d) => ({ d, items: drafts.filter((x) => x.date === d) })).filter((g) => g.items.length);
  const pending = drafts.filter((d) => !d.saved && ready(d));
  const locked = !!result?.locked;

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-4 overflow-y-auto", isMobile ? "h-[100dvh] w-full" : "w-full sm:max-w-xl")}
      >
        <SheetHeader>
          <SheetTitle>{t(k("title"))}</SheetTitle>
          <SheetDescription>{t(k("subtitle"))}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t(k("week"))}>
          {[thisWeek, lastWeek, ...(initialWeek && initialWeek !== thisWeek && initialWeek !== lastWeek ? [initialWeek] : [])].map((w) => (
            <Button key={w} size="sm" variant={w === week ? "default" : "outline"} onClick={() => { setWeek(w); setResult(null); setDrafts([]); }}>
              {w === thisWeek ? t(k("thisWeek")) : w === lastWeek ? t(k("lastWeek")) : format(parseISO(w), "d MMM", { locale })}
            </Button>
          ))}
        </div>

        {/* INPUT */}
        <div className="space-y-3">
          {!typing && !text && (
            <div className="flex flex-col items-center gap-3 py-4">
              <MicButton onText={(x) => setText((p) => (p ? `${p} ${x}` : x))} />
              <p className="text-sm text-muted-foreground">{t(k("tapToDictate"))}</p>
              <button type="button" className="text-sm underline underline-offset-4" onClick={() => setTyping(true)}>
                {t(k("typeInstead"))}
              </button>
            </div>
          )}
          {(typing || text) && (
            <>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ts-assistant-text">
                {text && !typing ? t(k("transcript")) : t(k("describe"))}
              </label>
              <div className="flex gap-2">
                <Textarea id="ts-assistant-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t(k("placeholder"))} />
                <MicButton size="sm" onText={(x) => setText((p) => (p ? `${p} ${x}` : x))} />
              </div>
              <Button onClick={() => { setHistory([]); void run([]); }} disabled={loading || !text.trim()} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {result ? t(k("reparse")) : t(k("draft"))}
              </Button>
            </>
          )}
        </div>

        {locked && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" /> {t(k("weekLocked"))}
          </div>
        )}

        {/* QUESTIONS */}
        {result && result.questions.length > 0 && (
          <div className="space-y-3 rounded-md border bg-muted/40 p-3">
            {result.questions.map((q, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium">{q.text}</p>
                {q.options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <Button key={o} size="sm" variant={answers[i] === o ? "default" : "outline"} onClick={() => setAnswers((a) => ({ ...a, [i]: o }))}>
                        {o}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input value={answers[i] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} placeholder={t(k("answerPlaceholder"))} aria-label={q.text} />
                  <MicButton size="sm" onText={(x) => setAnswers((a) => ({ ...a, [i]: x }))} />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => submitAnswers()} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t(k("sendAnswers"))}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => submitAnswers(true)} disabled={loading}>
                {t(k("imDone"))}
              </Button>
            </div>
          </div>
        )}

        {/* DRAFTS */}
        {result && drafts.length === 0 && !loading && <p className="text-sm text-muted-foreground">{t(k("noDrafts"))}</p>}
        {grouped.map((g) => (
          <div key={g.d} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {format(parseISO(g.d), "EEEE d MMM", { locale })}
            </h3>
            {g.items.map((d) => {
              const proj = d.project_id ? projById.get(d.project_id) : undefined;
              const already = existingFor(d);
              return (
                <div key={d.key} className={cn("space-y-2 rounded-md border p-3", d.confidence === "low" && !d.saved && "border-warning bg-warning/5", d.saved && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-2">
                    {d.confidence === "low" && !d.saved && <Badge variant="outline" className="border-warning text-warning">{t(k("lowConfidence"))}</Badge>}
                    {d.start_time && d.end_time && <span className="text-xs text-muted-foreground">{d.start_time}–{d.end_time}</span>}
                    {already > 0 && !d.saved && (
                      <span className="text-xs text-muted-foreground">{t(k("adds"), { hours: d.hours, already })}</span>
                    )}
                    {d.saved && <span className="text-xs text-success">✓ {t(k("savedOne"))}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <select aria-label={t(k("day"))} className="h-9 rounded-md border bg-background px-2 text-sm" value={d.date} disabled={d.saved} onChange={(e) => update(d.key, { date: e.target.value })}>
                      {days.map((x) => <option key={x} value={x}>{format(parseISO(x), "EEE d", { locale })}</option>)}
                    </select>
                    <Input aria-label={t(k("hours"))} type="number" step="0.25" min="0.25" max="24" className="h-9" value={d.hours} disabled={d.saved} onChange={(e) => update(d.key, { hours: Number(e.target.value) })} />
                    <select aria-label={t(k("type"))} className="col-span-2 h-9 rounded-md border bg-background px-2 text-sm" value={d.entry_type} disabled={d.saved} onChange={(e) => update(d.key, { entry_type: e.target.value as Draft["entry_type"], project_id: null, stage_id: null, internal_category: null })}>
                      <option value="project">{t(k("project"))}</option>
                      <option value="internal">{t(k("internal"))}</option>
                    </select>
                  </div>
                  {d.entry_type === "project" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select aria-label={t(k("project"))} className="h-9 rounded-md border bg-background px-2 text-sm" value={d.project_id ?? ""} disabled={d.saved} onChange={(e) => { const p = projById.get(e.target.value); update(d.key, { project_id: e.target.value || null, stage_id: p?.stages.length === 1 ? p.stages[0].id : null }); }}>
                        <option value="">{t(k("pickProject"))}</option>
                        {(result?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.client ? ` — ${p.client}` : ""}</option>)}
                      </select>
                      <select aria-label={t(k("stage"))} className="h-9 rounded-md border bg-background px-2 text-sm" value={d.stage_id ?? ""} disabled={d.saved || !proj} onChange={(e) => update(d.key, { stage_id: e.target.value || null })}>
                        <option value="">{t(k("pickStage"))}</option>
                        {(proj?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  ) : (
                    <select aria-label={t(k("category"))} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={d.internal_category ?? ""} disabled={d.saved} onChange={(e) => update(d.key, { internal_category: e.target.value || null })}>
                      <option value="">{t(k("pickCategory"))}</option>
                      {(result?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <Input aria-label={t(k("note"))} className="h-9" value={d.note} disabled={d.saved} onChange={(e) => update(d.key, { note: e.target.value })} placeholder={t(k("note"))} />
                  {!d.saved && (
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="ghost" aria-label={t(k("delete"))} onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" disabled={!ready(d) || saving || locked} onClick={() => save([d])}>
                        <Check className="mr-1 h-4 w-4" /> {t(k("confirm"))}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {pending.length > 1 && (
          <Button onClick={() => save(pending)} disabled={saving || locked} className="w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t(k("confirmAll"), { count: pending.length })}
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Home card: "Log my hours" with a big mic. */
export function LogHoursCard() {
  const { t } = useTranslation(NS);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
      <Button size="lg" className="h-14 w-14 shrink-0 rounded-full p-0" aria-label={t(k("startRecording"))} onClick={() => { setTyping(false); setOpen(true); }}>
        <Mic className="h-6 w-6" />
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{t(k("cardTitle"))}</h2>
        <p className="text-sm text-muted-foreground">{t(k("cardSub"))}</p>
      </div>
      <button type="button" className="shrink-0 text-sm underline underline-offset-4" onClick={() => { setTyping(true); setOpen(true); }}>
        {t(k("typeInstead"))}
      </button>
      {open && <TimesheetAssistantSheet open={open} onOpenChange={setOpen} startTyping={typing} />}
    </div>
  );
}
