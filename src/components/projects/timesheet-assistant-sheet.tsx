import { useNonWorkingDays, nonWorkingLine } from "@/lib/projects/use-non-working-days";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, Loader2, Mic, Square, Trash2, AlertTriangle, CalendarDays, X } from "lucide-react";
import { CalendarConnection, useCalendarStatus } from "@/components/projects/calendar-connection";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDateLocale } from "@/i18n/use-date-locale";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceRecorder, transcriptionLanguage } from "@/components/marketing/use-voice-recorder";
import { VoiceLevelMeter } from "@/components/marketing/voice-level-meter";
import { transcribeTimesheetDictation } from "@/lib/projects/timesheet-transcribe.functions";
import { rememberCalendarMatch } from "@/lib/projects/calendar.functions";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import { useEnsureStageRow, useUpsertTimesheetCell } from "@/lib/projects/use-timesheet";
import {
  parseTimesheetDictation,
  type AssistantDraft,
  type AssistantResult,
} from "@/lib/projects/timesheet-assistant.functions";
import { ProjectStageLeadPicker } from "@/components/projects/project-stage-lead-picker";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TRACKING_START } from "@/lib/reports/hours-logged";

const NS = "projects";
const k = (s: string) => `timesheetAssistant.${s}`;

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

type Draft = AssistantDraft & { key: string; saved?: boolean; /** Dictation id, or "cal" for calendar-only drafts. */ dict: string };
type Dictation = { id: string; n: number; text: string; edit: string | null; open: boolean; answers: Array<{ q: string; a: string }> };

/** Large "Tap to talk" button: records, shows a timer, transcribes, hands the text back. Audio is never stored. */
function RecordButton({ onText, disabled, className }: { onText: (t: string) => void; disabled?: boolean; className?: string }) {
  const { t } = useTranslation(NS);
  const rec = useVoiceRecorder("timesheet");
  const transcribe = useServerFn(transcribeTimesheetDictation);
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!rec.recording) return;
    const id = window.setInterval(() => setSecs(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [rec.recording]);
  async function toggle() {
    if (rec.recording) {
      const wav = await rec.stop();
      if (!wav) return;
      setBusy(true);
      try {
        const { text } = await transcribe({ data: { audioBase64: await blobToBase64(wav), mimeType: "audio/wav", filename: "hours.wav", language: transcriptionLanguage() } });
        if (text.trim()) onText(text.trim());
      } catch (e) {
        toast.error(t(k("transcribeFailed")), { description: (e as Error).message });
      } finally {
        setBusy(false);
      }
      return;
    }
    setSecs(0);
    const ok = await rec.start();
    if (ok) startedAt.current = Date.now();
  }
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <Button
      type="button"
      onClick={toggle}
      disabled={busy || rec.starting || (disabled && !rec.recording)}
      variant={rec.recording ? "destructive" : "default"}
      size="lg"
      className={cn("h-14 w-full gap-3 text-base", className)}
      aria-label={rec.recording ? t(k("record.stop")) : t(k("record.tap"))}
    >
      {busy ? (
        <><Loader2 className="h-5 w-5 animate-spin" /> {t(k("record.transcribing"))}</>
      ) : rec.starting ? (
        <><Loader2 className="h-5 w-5 animate-spin" /> {t("common:voice.starting")}</>
      ) : rec.recording ? (
        <>
          <VoiceLevelMeter level={rec.level} />
          <span>{t(k("record.recording"), { time })}</span>
          <span className="ml-auto flex items-center gap-1"><Square className="h-4 w-4" /> {t(k("record.stop"))}</span>
        </>
      ) : (
        <span>{t(k("record.tap"))}</span>
      )}
    </Button>
  );
}

/** Mic button that records, transcribes and hands the text back. Audio is never stored. */
function MicButton({ onText, size = "lg" }: { onText: (t: string) => void; size?: "lg" | "sm" }) {
  const { t } = useTranslation(NS);
  const rec = useVoiceRecorder("timesheet");
  const transcribe = useServerFn(transcribeTimesheetDictation);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (rec.recording) {
      const wav = await rec.stop();
      if (!wav) return;
      setBusy(true);
      try {
        const { text } = await transcribe({ data: { audioBase64: await blobToBase64(wav), mimeType: "audio/wav", filename: "hours.wav", language: transcriptionLanguage() } });
        if (text.trim()) onText(text.trim());
      } catch (e) {
        toast.error(t(k("transcribeFailed")), { description: (e as Error).message });
      } finally {
        setBusy(false);
      }
      return;
    }
    await rec.start();
  }
  const big = size === "lg";
  return (
    <Button
      type="button"
      onClick={toggle}
      disabled={busy || rec.starting}
      variant={rec.recording ? "destructive" : big ? "default" : "outline"}
      size={big ? "lg" : "icon"}
      className={cn(big && "h-16 w-16 rounded-full p-0")}
      aria-label={rec.recording ? t(k("stopRecording")) : t(k("startRecording"))}
    >
      {busy || rec.starting ? <Loader2 className="h-5 w-5 animate-spin" /> : rec.recording ? <VoiceLevelMeter level={rec.level} /> : <Mic className={big ? "h-7 w-7" : "h-4 w-4"} />}
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
  const { t, i18n } = useTranslation(NS);
  const isMobile = useIsMobile();
  const locale = useDateLocale();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useProjectsAuth();
  const parse = useServerFn(parseTimesheetDictation);
  const rememberMatch = useServerFn(rememberCalendarMatch);
  const upsert = useUpsertTimesheetCell();
  const ensureRow = useEnsureStageRow();
  const cal = useCalendarStatus();

  const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const lastWeek = format(subWeeks(parseISO(thisWeek), 1), "yyyy-MM-dd");
  const [week, setWeek] = useState(initialWeek ?? thisWeek);
  /** Extra week buttons (opened from the timesheet, picked, or switched to). */
  const [extraWeeks, setExtraWeeks] = useState<string[]>(initialWeek && initialWeek !== thisWeek && initialWeek !== lastWeek ? [initialWeek] : []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const addWeek = (w: string) => { if (w !== thisWeek && w !== lastWeek) setExtraWeeks((xs) => (xs.includes(w) ? xs : [...xs, w].sort())); };
  const [text, setText] = useState("");
  const [dictations, setDictations] = useState<Dictation[]>([]);
  /** Dictation the current questions belong to. */
  const [activeDict, setActiveDict] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);
  const [skipped, setSkipped] = useState<Record<number, boolean>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setText("");
    setResult(null);
    setDrafts([]);
    setAnswers({});
    setHistory([]);
    setDictations([]);
    setActiveDict(null);
  }

  /**
   * Process ONE dictation (or the calendar when dictId is "cal"). Its previous
   * unsaved drafts are replaced; every other draft is sent as context so the
   * model never recreates it, and explicit corrections patch it in place.
   */
  async function run(dictId: string, dictText: string, extra: Array<{ q: string; a: string }> = [], done = false, forWeek = week, base: Draft[] = drafts) {
    // A dictation is never sent empty (the server would refuse it); only the calendar pass may.
    if (!dictText.trim() && (dictId !== "cal" || !cal.connected)) return;
    setLoading(true);
    try {
      const others = base.filter((d) => !d.saved && d.dict !== dictId);
      const refToKey = new Map(others.map((d, i) => [`c${i + 1}`, d.key]));
      const labelOf = (d: Draft) => {
        if (d.entry_type === "project") {
          const p = result?.projects.find((x) => x.id === d.project_id);
          return `project ${p?.name ?? "?"} · ${p?.stages.find((s) => s.id === d.stage_id)?.name ?? "?"}`;
        }
        if (d.opportunity_id) return `Pursuit · ${result?.leads.find((l) => l.id === d.opportunity_id)?.name ?? "?"}`;
        return `internal ${d.internal_category ?? "?"}`;
      };
      const current = others.map((d, i) => ({ ref: `c${i + 1}`, date: d.date, hours: d.hours, label: labelOf(d).slice(0, 300), note: d.note.slice(0, 300), event_id: d.event_id }));
      const r = await parse({ data: { text: dictText, current, weekStart: forWeek, today: format(new Date(), "yyyy-MM-dd"), answers: extra, done, useCalendar: cal.connected, lang: i18n.language?.startsWith("pt") ? "pt" : "en" } });
      const stamp = Date.now();
      const idMap = new Map<string, string>();
      const patches = new Map<string, AssistantDraft>();
      const added: Draft[] = [];
      for (const e of r.entries) {
        const target = e.updates ? refToKey.get(e.updates) : undefined;
        if (target) {
          patches.set(target, e);
          idMap.set(e.id, base.find((d) => d.key === target)!.id);
        } else {
          const id = `${dictId}:${e.id}`;
          idMap.set(e.id, id);
          added.push({ ...e, id, key: `${stamp}-${id}`, dict: dictId });
        }
      }
      setDrafts((ds) => [
        ...ds
          .filter((d) => d.saved || d.dict !== dictId)
          .map((d) => {
            const p = patches.get(d.key);
            if (!p || d.saved) return d;
            return {
              ...d,
              date: p.date,
              hours: p.hours,
              start_time: p.start_time ?? d.start_time,
              end_time: p.end_time ?? d.end_time,
              ...(p.entry_type === "project" ? (p.project_id ? { entry_type: "project" as const, project_id: p.project_id, stage_id: p.stage_id, internal_category: null, opportunity_id: null } : {}) : p.internal_category ? { entry_type: "internal" as const, project_id: null, stage_id: null, internal_category: p.internal_category, opportunity_id: p.opportunity_id } : {}),
              note: p.note || d.note,
              confidence: p.confidence,
            };
          }),
        ...added,
      ]);
      setResult({ ...r, questions: r.questions.map((q) => ({ ...q, draft_ids: q.draft_ids.map((x) => idMap.get(x) ?? x) })) });
      setActiveDict(dictId);
      setAnswers({});
      setSkipped({});
      setOtherOpen({});
    } catch (e) {
      toast.error(t(k("parseFailed")), { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  // Calendar connected: draft the week's events as soon as the sheet opens / the week changes.
  useEffect(() => {
    if (open && cal.connected && !result && !loading && dictations.length === 0) void run("cal", "", [], false, week);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cal.connected, week]);

  async function dismiss(d: Draft) {
    setDrafts((ds) => ds.filter((x) => x.key !== d.key));
    if (!d.event_id || !user) return;
    const { error } = await supabase.from("calendar_dismissed_events").upsert({ user_id: user.id, event_id: d.event_id });
    if (error) toast.error(t(k("calendar.dismissFailed")), { description: error.message });
  }

  /** "Don't log": drop the question's drafts and dismiss its calendar events for good. */
  async function skipQuestion(i: number) {
    const q = result?.questions[i];
    if (!q) return;
    setSkipped((s) => ({ ...s, [i]: true }));
    setAnswers((a) => ({ ...a, [i]: t(k("q.dontLog")) }));
    const ids = new Set(q.draft_ids);
    const evs = new Set(q.event_ids);
    setDrafts((ds) => ds.filter((d) => d.saved || !(ids.has(d.id) || (d.event_id && evs.has(d.event_id)))));
    if (evs.size && user) {
      const { error } = await supabase.from("calendar_dismissed_events").upsert([...evs].map((event_id) => ({ user_id: user.id, event_id })));
      if (error) toast.error(t(k("calendar.dismissFailed")), { description: error.message });
    }
  }


  function submitAnswers(done = false) {
    if (!result) return;
    const dictId = activeDict ?? "cal";
    const dict = dictations.find((d) => d.id === dictId);
    const prev = dict ? dict.answers : history;
    const next = [...prev, ...result.questions.map((q, i) => ({ q: q.text, a: answers[i] ?? "" })).filter((x) => x.a.trim())];
    if (dict) setDictations((ds) => ds.map((d) => (d.id === dictId ? { ...d, answers: next } : d)));
    else setHistory(next);
    void run(dictId, dict?.text ?? "", next, done);
  }

  /** A new dictation: processed on its own, its drafts are added to the current ones. */
  function addDictation(raw: string) {
    const body = raw.trim();
    if (!body) return;
    const n = dictations.length + 1;
    const id = `t${n}`;
    setDictations((ds) => [...ds, { id, n, text: body, edit: null, open: false, answers: [] }]);
    setText("");
    void run(id, body, []);
  }

  /** Re-process an edited earlier dictation; replaces only its drafts. */
  function reprocess(id: string) {
    const d = dictations.find((x) => x.id === id);
    if (!d || d.edit == null || !d.edit.trim()) return;
    const body = d.edit.trim();
    setDictations((ds) => ds.map((x) => (x.id === id ? { ...x, text: body, edit: null, answers: [] } : x)));
    void run(id, body, []);
  }

  function selectWeek(w: string) {
    setWeek(w); setResult(null); setDrafts([]); setDictations([]); setActiveDict(null); setHistory([]);
  }

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(week), i), "yyyy-MM-dd")), [week]);
  const nwdMap = useNonWorkingDays(days[0], days[6]).data;
  const projById = useMemo(() => new Map((result?.projects ?? []).map((p) => [p.id, p])), [result]);

  function existingFor(d: Draft): number {
    if (!result) return 0;
    return result.existing
      .filter((e) => e.date === d.date && (d.entry_type === "project" ? e.entry_type === "project" && e.stage_id === d.stage_id && !!d.stage_id : e.entry_type === "internal" && e.internal_category === d.internal_category))
      .reduce((s, e) => s + e.hours, 0);
  }
  const ready = (d: Draft) =>
    (d.entry_type === "project"
      ? !!d.project_id && !!d.stage_id
      : !!d.internal_category && (d.internal_category !== "Pursuit" || !!d.opportunity_id)) && d.hours > 0;
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
        const time = d.start_time && d.end_time ? `${d.start_time}–${d.end_time} ` : "";
        const note = `${time}${d.note}`.trim();
        // Each confirmed draft is its own activity (own note, own calendar event id).
        await upsert.mutateAsync({
          entry_type: d.entry_type,
          task_id: taskId,
          internal_category: d.entry_type === "internal" ? d.internal_category : null,
          opportunity_id: d.entry_type === "internal" ? (d.opportunity_id ?? null) : null,
          user_id: user.id,
          entry_date: d.date,
          hours: d.hours,
          notes: note || null,
          existing_entry_id: null,
          source: "assistant",
          calendar_event_ids: d.event_id ? [d.event_id] : undefined,
        });
        if (d.event_id) {
          const m = result.eventMatches?.[d.event_id];
          if (m && (m.series_id || m.match_word))
            void rememberMatch({
              data: {
                series_id: m.series_id,
                word: m.match_word,
                project_id: d.entry_type === "project" ? d.project_id : null,
                stage_id: d.entry_type === "project" ? d.stage_id : null,
                opportunity_id: d.opportunity_id ?? null,
                internal_category: d.entry_type === "internal" ? d.internal_category : null,
              },
            }).catch(() => undefined);
        }
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

  const groupOf = (list: Draft[]) => days.map((d) => ({ d, items: list.filter((x) => x.date === d) })).filter((g) => g.items.length);
  const grouped = groupOf(drafts.filter((x) => x.dict !== "cal"));
  const calGrouped = groupOf(drafts.filter((x) => x.dict === "cal"));
  const calExpired = result?.calendar.status === "expired";
  const pending = drafts.filter((d) => !d.saved && ready(d));
  const locked = !!result?.locked;

  const renderGroups = (groups: typeof grouped) => groups.map((g) => (
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
                    {d.event_id && <Badge variant="outline" className="gap-1"><CalendarDays className="h-3 w-3" aria-hidden />{t(k("calendar.fromCalendarBadge"))}</Badge>}
                    {d.confidence === "low" && !d.saved && <Badge variant="outline" className="border-warning text-warning">{t(k("lowConfidence"))}</Badge>}
                    {d.start_time && d.end_time && <span className="text-xs text-muted-foreground">{d.start_time}–{d.end_time}</span>}
                    {!d.saved && (
                      <span className="text-xs text-muted-foreground">
                        {t(k("adds"), { hours: d.hours })}
                        {already > 0 ? ` · ${t(k("addsAlready"), { already })}` : ""}
                      </span>
                    )}
                    {d.saved && <span className="text-xs text-success">✓ {t(k("savedOne"))}</span>}
                  </div>
                  {!d.saved && nwdMap?.get(d.date) && (
                    <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-xs">
                      <span className="mr-1 font-medium text-warning">{t(`projects:nonWorkingDay.badge.${nwdMap.get(d.date)!.reason}`)}</span>
                      {nonWorkingLine(t, d.date, nwdMap.get(d.date)!, locale)}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <select aria-label={t(k("day"))} className="h-9 rounded-md border bg-background px-2 text-sm" value={d.date} disabled={d.saved} onChange={(e) => update(d.key, { date: e.target.value })}>
                      {days.map((x) => <option key={x} value={x}>{format(parseISO(x), "EEE d", { locale })}</option>)}
                    </select>
                    <Input aria-label={t(k("hours"))} type="number" step="0.25" min="0.25" max="24" className="h-9" value={d.hours} disabled={d.saved} onChange={(e) => update(d.key, { hours: Number(e.target.value) })} />
                    <select aria-label={t(k("type"))} className="col-span-2 h-9 rounded-md border bg-background px-2 text-sm" value={d.entry_type} disabled={d.saved} onChange={(e) => update(d.key, { entry_type: e.target.value as Draft["entry_type"], project_id: null, stage_id: null, internal_category: null, opportunity_id: null })}>
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
                    <select aria-label={t(k("category"))} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={d.opportunity_id ? `lead:${d.opportunity_id}` : (d.internal_category ?? "")} disabled={d.saved} onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith("lead:")) update(d.key, { internal_category: "Pursuit", opportunity_id: v.slice(5) });
                      else update(d.key, { internal_category: v || null, opportunity_id: null });
                    }}>
                      <option value="">{t(k("pickCategory"))}</option>
                      {d.internal_category === "Pursuit" && !d.opportunity_id && <option value="Pursuit" disabled>{t("projects:pursuit.categoryLabel")} · ?</option>}
                      {(result?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                      {(result?.leads ?? []).length > 0 && (
                        <optgroup label={t("projects:pursuit.leadsGroup")}>
                          {(result?.leads ?? []).map((l) => (
                            <option key={l.id} value={`lead:${l.id}`}>
                              {t("projects:pursuit.categoryLabel")} · {l.name}{l.client ? ` · ${l.client}` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  )}
                  <Input aria-label={t(k("note"))} className="h-9" value={d.note} disabled={d.saved} onChange={(e) => update(d.key, { note: e.target.value })} placeholder={t(k("note"))} />
                  {!d.saved && (
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="ghost" aria-label={d.event_id ? t(k("calendar.dismiss")) : t(k("delete"))} onClick={() => void dismiss(d)}>
                        {d.event_id ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
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
        ));

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
          {[thisWeek, lastWeek, ...extraWeeks].map((w) => (
            <Button key={w} size="sm" variant={w === week ? "default" : "outline"} onClick={() => selectWeek(w)}>
              {w === thisWeek ? t(k("thisWeek")) : w === lastWeek ? t(k("lastWeek")) : format(parseISO(w), "d MMM", { locale })}
            </Button>
          ))}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline"><CalendarDays className="mr-1 h-4 w-4" />{t(k("otherWeekPick"))}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                weekStartsOn={1}
                selected={parseISO(week)}
                defaultMonth={parseISO(week)}
                disabled={[{ before: parseISO(TRACKING_START) }, { after: addDays(parseISO(thisWeek), 6) }]}
                onSelect={(d) => { if (!d) return; const w = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"); addWeek(w); selectWeek(w); setPickerOpen(false); }}
                className="pointer-events-auto p-3"
              />
            </PopoverContent>
          </Popover>
        </div>

        <CalendarConnection compact expired={calExpired} />

        {/* EARLIER DICTATIONS — each used once */}
        {dictations.length > 0 && (
          <ul className="space-y-1" aria-label={t(k("dictation.list"))}>
            {dictations.map((d) => (
              <li key={d.id} className="rounded-md border bg-muted/30 text-sm">
                <button type="button" className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={d.open} onClick={() => setDictations((ds) => ds.map((x) => (x.id === d.id ? { ...x, open: !x.open } : x)))}>
                  {d.open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{t(k("dictation.label"), { n: d.n })}:</span> «{d.text}»
                  </span>
                </button>
                {d.open && (
                  <div className="space-y-2 px-3 pb-3">
                    {d.edit == null ? (
                      <>
                        <p className="whitespace-pre-wrap text-muted-foreground">{d.text}</p>
                        <button type="button" className="text-xs underline underline-offset-4" onClick={() => setDictations((ds) => ds.map((x) => (x.id === d.id ? { ...x, edit: x.text ?? "" } : x)))}>
                          {t(k("dictation.edit"))}
                        </button>
                      </>
                    ) : (
                      <>
                        <Textarea rows={3} value={d.edit} aria-label={t(k("dictation.label"), { n: d.n })} onChange={(e) => setDictations((ds) => ds.map((x) => (x.id === d.id ? { ...x, edit: e.target.value } : x)))} />
                        <div className="flex gap-2">
                          {d.edit.trim() !== "" && d.edit.trim() !== d.text && (
                            <Button size="sm" disabled={loading || !d.edit.trim()} onClick={() => reprocess(d.id)}>{t(k("reparse"))}</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDictations((ds) => ds.map((x) => (x.id === d.id ? { ...x, edit: null } : x)))}>{t(k("dictation.cancel"))}</Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* INPUT */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ts-assistant-text">
            {dictations.length ? t(k("dictation.next")) : t(k("describe"))}
          </label>
          <Textarea id="ts-assistant-text" rows={3} autoFocus={startTyping} value={text} onChange={(e) => setText(e.target.value)} placeholder={t(k("placeholder"))} />
          {text.trim() && (
            <Button onClick={() => addDictation(text)} disabled={loading} variant="outline" className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(k("draft"))}
            </Button>
          )}
          {!isMobile && <RecordButton disabled={loading} onText={addDictation} />}
          {loading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {t(k("preparing"))}</p>}
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
              <div key={i} className={cn("space-y-2", skipped[i] && "opacity-60")}>
                {q.context && (
                  <p className="whitespace-pre-line rounded border-l-2 border-primary/40 bg-background px-2 py-1 text-xs text-muted-foreground">{q.context}</p>
                )}
                <p className="text-sm font-medium">{q.text}</p>
                {skipped[i] ? (
                  <p className="text-xs text-muted-foreground">✓ {t(k("q.skipped"))}</p>
                ) : (
                <>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <Button key={o} size="sm" variant={answers[i] === o ? "default" : "outline"} onClick={() => setAnswers((a) => ({ ...a, [i]: o }))}>
                      {o}
                    </Button>
                  ))}
                  <Button size="sm" variant={otherOpen[i] ? "default" : "outline"} onClick={() => setOtherOpen((x) => ({ ...x, [i]: !x[i] }))}>
                    {t(k("q.other"))}
                  </Button>
                  {(q.draft_ids.length > 0 || q.event_ids.length > 0) && (
                    <Button size="sm" variant="outline" className="border-destructive/40 text-destructive" onClick={() => void skipQuestion(i)}>
                      {t(k("q.dontLog"))}
                    </Button>
                  )}
                </div>
                {otherOpen[i] && result && (
                  <div className="rounded-md border bg-background">
                    <ProjectStageLeadPicker
                      autoFocus
                      projects={result.projects}
                      leads={result.leads}
                      categories={result.categories.filter((c) => c !== "Pursuit")}
                      refDate={q.draft_ids.map((id) => drafts.find((d) => d.id === id)?.date).find(Boolean) ?? week}
                      suggestions={(result.eventMatches?.[q.event_ids[0]]?.suggestions ?? []).map((sg) => ({
                        key: sg.key,
                        label: sg.label,
                        reason: sg.reason,
                        preselect: sg.preselect,
                        project: sg.project_id ? result.projects.find((p) => p.id === sg.project_id) : undefined,
                        stage: sg.stage,
                        lead: sg.lead_id ? result.leads.find((l) => l.id === sg.lead_id) : undefined,
                        category: sg.internal_category && !sg.lead_id ? sg.internal_category : undefined,
                      }))}
                      onPickStage={(p, s) => { setAnswers((a) => ({ ...a, [i]: `${p.name} · ${s.name}` })); setOtherOpen((x) => ({ ...x, [i]: false })); }}
                      onPickProject={(p) => { setAnswers((a) => ({ ...a, [i]: p.name })); setOtherOpen((x) => ({ ...x, [i]: false })); }}
                      onPickLead={(l) => { setAnswers((a) => ({ ...a, [i]: `${l.name} · ${t(k("q.leadSuffix"))}` })); setOtherOpen((x) => ({ ...x, [i]: false })); }}
                      onPickCategory={(c) => { setAnswers((a) => ({ ...a, [i]: c })); setOtherOpen((x) => ({ ...x, [i]: false })); }}
                    />
                  </div>
                )}
                </>
                )}
                {!skipped[i] && <div className="flex gap-2">
                  <Input value={answers[i] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} placeholder={t(k("answerPlaceholder"))} aria-label={q.text} />
                  <MicButton size="sm" onText={(x) => setAnswers((a) => ({ ...a, [i]: x }))} />
                </div>}
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
        {result?.otherWeek && !loading && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning bg-warning/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            <span className="flex-1">{t(k("otherWeek.text"), { date: format(parseISO(result.otherWeek), "d MMM", { locale }) })}</span>
            <Button size="sm" onClick={() => { const w = result.otherWeek!; const id = activeDict ?? dictations[dictations.length - 1]?.id ?? "cal"; const dict = dictations.find((x) => x.id === id); const body = dict?.text ?? ""; addWeek(w); setWeek(w); setDrafts((ds) => ds.filter((x) => x.saved)); setHistory([]); if (dict) setDictations((ds) => ds.map((x) => (x.id === id ? { ...x, edit: null, answers: [] } : x))); void run(id, body, [], false, w, []); }}>
              {t(k("otherWeek.switch"))}
            </Button>
          </div>
        )}
        {result && result.entries.length === 0 && result.skipped.length === 0 && result.questions.length === 0 && !loading && activeDict !== "cal" && activeDict && <p className="text-sm text-muted-foreground">{t(k("noDrafts"))}</p>}
        {grouped.length > 0 && renderGroups(grouped)}
        {result && grouped.length > 0 && (() => {
          const notes = grouped.map((g) => {
            const logged = result.existing.filter((e) => e.date === g.d && e.entry_type !== "non_working").reduce((x, e) => x + e.hours, 0);
            if (!(logged > 0)) return null;
            const added = g.items.filter((d) => !d.saved).reduce((x, d) => x + d.hours, 0);
            const day = format(parseISO(g.d), "EEEE", { locale });
            return t(k("dayNote"), { day: day.charAt(0).toUpperCase() + day.slice(1).replace(/-feira$/, ""), logged, total: logged + added });
          }).filter(Boolean);
          return notes.length > 0 && <div className="space-y-0.5 text-xs text-muted-foreground">{notes.map((n, i) => <p key={i}>{n}</p>)}</div>;
        })()}
        {result && result.skipped.length > 0 && !result.otherWeek && (
          <ul className="space-y-1 rounded-md border border-dashed p-3 text-sm text-muted-foreground" aria-label={t(k("skipped.title"))}>
            {result.skipped.map((x, i) => (
              <li key={i}>
                {t(k("skipped.line"), { quote: x.quote ?? x.date ?? "?", reason: t(k(`skipped.${x.reason}`)) })}
              </li>
            ))}
          </ul>
        )}
        {calGrouped.length > 0 && (
          <section className="space-y-3" aria-labelledby="ts-cal-heading">
            <h2 id="ts-cal-heading" className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" aria-hidden /> {t(k("calendar.fromCalendar"))}
            </h2>
            {renderGroups(calGrouped)}
          </section>
        )}
        {result?.calendar.status === "connected" && result.calendar.events === 0 && dictations.length === 0 && (
          <p className="text-sm text-muted-foreground">{t(k("calendar.nothingNew"))}</p>
        )}
        {pending.length > 1 && (
          <Button onClick={() => save(pending)} disabled={saving || locked} className="w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t(k("confirmAll"), { count: pending.length })}
          </Button>
        )}
        {isMobile && (
          <div className="sticky bottom-0 -mx-6 -mb-6 mt-auto border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <RecordButton disabled={loading} onText={addDictation} />
          </div>
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
