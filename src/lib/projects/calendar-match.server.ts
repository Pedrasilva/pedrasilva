/**
 * Calendar event → timesheet target ranking, shared by the grid suggestions and
 * the assistant's calendar drafts. Rules (no AI):
 *  1. Remembered choice for the event's recurring series (per person).
 *  2. Remembered choice for a single distinctive word (per person).
 *  3. Project number in the title.
 *  4. Distinctive words (4+ letters, accents ignored, no stop words / numbers /
 *     roman numerals) of the project name, client and aliases, or of a lead's
 *     name / company, found in the title or location. Several hits → all suggested.
 *  5. Attendee company → that company's active projects.
 * Memory keys are only a series id or one word — never titles or other content.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchStage = { id: string; name: string; start_date: string; end_date: string };
export type MatchProject = { id: string; name: string; client: string | null; company_id: string | null; aliases: string[]; stages: MatchStage[] };
export type MatchLead = { id: string; name: string; client: string | null };
export type MatchEvent = { id: string; title: string; location: string | null; date: string; attendees: string[]; series_id: string | null };

export type MatchReason = "remembered" | "word" | "number" | "attendee";
export type EventSuggestion = {
  key: string;
  reason: MatchReason;
  project_id: string | null;
  project_name: string | null;
  /** All stages that take new hours, so the picker can open the project. */
  project_stages: MatchStage[];
  stage: MatchStage | null;
  lead_id: string | null;
  lead_name: string | null;
  internal_category: string | null;
  label: string;
  preselect: boolean;
};
export type RankedEvent = {
  suggestions: EventSuggestion[];
  /** The single distinctive word the event matched by (only when matched only by a word). */
  match_word: string | null;
};

const STOP = new Set(
  `escritorios escritorio obra obras projecto projeto projectos projetos concept conceito design designs reuniao reunioes meeting meetings call calls
   chamada visita visitas sessao apresentacao presentation review revisao ponto situacao status update weekly semanal mensal kickoff kick
   cliente client equipa team interna interno internal externa externo with para pela pelo como sobre entre desde online teams zoom google meet
   fase phase etapa stage estudo previo licenciamento execucao tender construction supervisao assistencia tecnica technical developed
   lisboa porto portugal lisbon sala room edificio building casa house moradia apartamento office offices escritorio loja store retail
   alteracao alteracoes geral general novo nova new final fecho close`.split(/\s+/).filter(Boolean),
);
const ROMAN = /^[ivxlcdm]+$/;
export const normWords = (x: string | null | undefined): string[] =>
  (x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
export const distinctive = (x: string | null | undefined): string[] =>
  [...new Set(normWords(x).filter((w) => w.length >= 4 && !/\d/.test(w) && !ROMAN.test(w) && !STOP.has(w)))];

type MemoryRow = { key_type: string; key: string; project_id: string | null; stage_id: string | null; opportunity_id: string | null; internal_category: string | null; last_used_at: string };

export type Matcher = { rank: (e: MatchEvent, companyOfEmail: Map<string, string>) => RankedEvent };

const monthOf = (s: MatchStage) => (s.start_date.slice(0, 7) === s.end_date.slice(0, 7) ? s.start_date.slice(0, 7) : null);

export async function buildMatcher(db: SupabaseClient, userId: string, projects: MatchProject[], leads: MatchLead[]): Promise<Matcher> {
  const [memRes, lastRes] = await Promise.all([
    db.from("calendar_match_memory").select("key_type, key, project_id, stage_id, opportunity_id, internal_category, last_used_at").eq("user_id", userId),
    db.from("pm_time_entries").select("task_id, entry_date").eq("user_id", userId).eq("entry_type", "project").not("task_id", "is", null).order("entry_date", { ascending: false }).limit(300),
  ]);
  const memory = (memRes.data ?? []) as MemoryRow[];
  const series = new Map<string, MemoryRow>();
  const words = new Map<string, MemoryRow>();
  for (const m of memory) (m.key_type === "series" ? series : words).set(m.key, m);

  // Stage last used per project (most recent entry first).
  const lastStage = new Map<string, string>();
  const taskIds = [...new Set(((lastRes.data ?? []) as Array<{ task_id: string }>).map((r) => r.task_id))];
  if (taskIds.length) {
    const { data: tasks } = await db.from("pm_tasks").select("id, allocation:pm_allocations(stage:pm_stages(id, project_id))").in("id", taskIds);
    const tStage = new Map<string, { id: string; project_id: string }>();
    for (const t of (tasks ?? []) as unknown as Array<{ id: string; allocation: { stage: { id: string; project_id: string } | null } | null }>)
      if (t.allocation?.stage) tStage.set(t.id, t.allocation.stage);
    for (const tid of taskIds) {
      const s = tStage.get(tid);
      if (s && !lastStage.has(s.project_id)) lastStage.set(s.project_id, s.id);
    }
  }

  const projById = new Map(projects.map((p) => [p.id, p]));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const projWords = projects.map((p) => {
    const nameNoNum = p.name.replace(/^\s*\d{3,5}[a-z]?\b/i, "");
    const number = /^\s*(\d{3,5}[a-z]?)\b/i.exec(p.name)?.[1]?.toLowerCase() ?? null;
    return { p, number, words: new Set([...distinctive(nameNoNum), ...distinctive(p.client), ...p.aliases.flatMap(distinctive)]) };
  });
  const leadWords = leads.map((l) => ({ l, words: new Set([...distinctive(l.name), ...distinctive(l.client)]) }));

  const stageFor = (p: MatchProject, date: string, remembered: string | null): MatchStage | null => {
    const by = (id: string | null | undefined) => (id ? p.stages.find((s) => s.id === id) ?? null : null);
    const month = (s: MatchStage | null) => {
      // A remembered/last month stage of a retainer → this event's own month.
      if (s && monthOf(s) && monthOf(s) !== date.slice(0, 7)) return p.stages.find((x) => monthOf(x) === date.slice(0, 7)) ?? null;
      return s;
    };
    return month(by(remembered)) ?? month(by(lastStage.get(p.id))) ?? (p.stages.length === 1 ? p.stages[0] : p.stages.find((s) => monthOf(s) === date.slice(0, 7)) ?? null);
  };

  const fromMemory = (m: MemoryRow, date: string): EventSuggestion | null => {
    if (m.project_id) {
      const p = projById.get(m.project_id);
      if (!p || !p.stages.length) return null;
      const st = stageFor(p, date, m.stage_id);
      return { key: `p:${p.id}`, reason: "remembered", project_id: p.id, project_name: p.name, project_stages: p.stages, stage: st, lead_id: null, lead_name: null, internal_category: null, label: st ? `${p.name} · ${st.name}` : p.name, preselect: false };
    }
    if (m.opportunity_id) {
      const l = leadById.get(m.opportunity_id);
      if (!l) return null;
      return { key: `l:${l.id}`, reason: "remembered", project_id: null, project_name: null, project_stages: [], stage: null, lead_id: l.id, lead_name: l.name, internal_category: null, label: l.name, preselect: false };
    }
    if (m.internal_category) return { key: `c:${m.internal_category}`, reason: "remembered", project_id: null, project_name: null, project_stages: [], stage: null, lead_id: null, lead_name: null, internal_category: m.internal_category, label: m.internal_category, preselect: false };
    return null;
  };
  const projSugg = (p: MatchProject, date: string, reason: MatchReason): EventSuggestion => {
    const st = stageFor(p, date, null);
    return { key: `p:${p.id}`, reason, project_id: p.id, project_name: p.name, project_stages: p.stages, stage: st, lead_id: null, lead_name: null, internal_category: null, label: st ? `${p.name} · ${st.name}` : p.name, preselect: false };
  };

  return {
    rank(e, companyOfEmail) {
      const tokens = normWords(`${e.title} ${e.location ?? ""}`);
      const tokenSet = new Set(tokens);
      const evWords = distinctive(`${e.title} ${e.location ?? ""}`);
      const scored: Array<{ s: EventSuggestion; score: number }> = [];
      const push = (s: EventSuggestion | null, score: number) => {
        if (!s) return;
        const prev = scored.find((x) => x.s.key === s.key);
        if (prev) prev.score = Math.max(prev.score, score);
        else scored.push({ s, score });
      };
      let seriesHit = false;
      if (e.series_id && series.has(e.series_id)) {
        const m = series.get(e.series_id)!;
        push(fromMemory(m, e.date), 3_000_000_000_000 + Date.parse(m.last_used_at) / 1000);
        seriesHit = true;
      }
      for (const w of evWords) {
        const m = words.get(w);
        if (m) push(fromMemory(m, e.date), 2_000_000_000_000 + Date.parse(m.last_used_at) / 1000);
      }
      for (const pw of projWords) {
        if (!pw.p.stages.length) continue;
        if (pw.number && tokenSet.has(pw.number)) push(projSugg(pw.p, e.date, "number"), 1_000_000);
      }
      const wordHits = new Map<string, string[]>(); // suggestion key → words
      let anyWord = false;
      for (const pw of projWords) {
        if (!pw.p.stages.length) continue;
        const hit = evWords.filter((w) => pw.words.has(w));
        if (hit.length) { anyWord = true; push(projSugg(pw.p, e.date, "word"), 1000 * hit.length); wordHits.set(`p:${pw.p.id}`, hit); }
      }
      for (const lw of leadWords) {
        const hit = evWords.filter((w) => lw.words.has(w));
        if (hit.length) {
          anyWord = true;
          push({ key: `l:${lw.l.id}`, reason: "word", project_id: null, project_name: null, project_stages: [], stage: null, lead_id: lw.l.id, lead_name: lw.l.name, internal_category: null, label: lw.l.name, preselect: false }, 1000 * hit.length - 1);
          wordHits.set(`l:${lw.l.id}`, hit);
        }
      }
      const cos = new Set(e.attendees.map((m) => companyOfEmail.get(m)).filter(Boolean) as string[]);
      if (cos.size) for (const pw of projWords) if (pw.p.company_id && cos.has(pw.p.company_id) && pw.p.stages.length) push(projSugg(pw.p, e.date, "attendee"), 10);

      scored.sort((a, b) => b.score - a.score);
      const suggestions = scored.slice(0, 3).map((x) => x.s);
      if (suggestions.length === 1 || (seriesHit && suggestions[0]?.reason === "remembered")) suggestions[0].preselect = true;

      // Learnable word: matched only by words (no number/attendee/series), via exactly one distinctive word.
      let match_word: string | null = null;
      const onlyWord = anyWord && !seriesHit && !scored.some((x) => x.s.reason === "number" || x.s.reason === "attendee");
      if (onlyWord) {
        const all = new Set([...wordHits.values()].flat());
        if (all.size === 1) match_word = [...all][0];
      }
      return { suggestions, match_word };
    },
  };
}

/** Remember a person's choice for a series and/or a single word. Own rows only (RLS). */
export async function rememberChoice(
  db: SupabaseClient,
  userId: string,
  keys: Array<{ key_type: "series" | "word"; key: string }>,
  target: { project_id: string | null; stage_id: string | null; opportunity_id: string | null; internal_category: string | null },
) {
  for (const k of keys) {
    const { data: cur } = await db.from("calendar_match_memory").select("id, uses").eq("user_id", userId).eq("key_type", k.key_type).eq("key", k.key).maybeSingle();
    const row = { ...target, last_used_at: new Date().toISOString() };
    if (cur) await db.from("calendar_match_memory").update({ ...row, uses: ((cur as { uses: number }).uses ?? 0) + 1 }).eq("id", (cur as { id: string }).id);
    else await db.from("calendar_match_memory").insert({ ...row, user_id: userId, key_type: k.key_type, key: k.key, uses: 1 });
  }
}
