/**
 * Estimate vs actual per phase type — pure calculation (no Supabase calls).
 *
 * planned hours = stage.baseline_target_hours, planned € = stage.baseline_budget
 * actual hours / € = stageActuals() from budget-consumption.ts (locked cost-rate
 * snapshots). Only own-work (is_self) leaf stages are passed in.
 */
export const PHASE_TYPES = ["F0", "F1", "F2", "F3", "F4", "F5", "F6"] as const;
export type PhaseType = (typeof PHASE_TYPES)[number];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Common names (accent-free, lower-case) → phase type. Only explicit matches; no guessing. */
const NAME_RULES: [RegExp, PhaseType][] = [
  [/\b(gestao|management|coordenacao de projeto)\b/, "F0"],
  [/\b(concept|conceito|estudo previo|programa|programme|programa preliminar|briefing|viabilidade|due dil+igence)\b/, "F1"],
  [/\b(developed design|licenciamento|projeto de licenciamento|comunicacao previa|anteprojeto|alvara)\b/, "F2"],
  [/\b(technical design|projeto de execucao|execucao)\b/, "F3"],
  [/\b(tender|concurso)\b/, "F4"],
  [/\b(construction|construcao|assistencia tecnica|avenca de obra|obra)\b/, "F5"],
  [/\b(close ?out|telas finais|encerramento)\b/, "F6"],
];

/** Map a code/name to a phase type, or null when it can't be mapped confidently. */
export function phaseTypeFromText(text: string | null | undefined): PhaseType | null {
  if (!text) return null;
  const m = /^\s*f\s*([0-6])(?![0-9])/i.exec(text);
  if (m) return `F${m[1]}` as PhaseType;
  const n = norm(text);
  for (const [re, pt] of NAME_RULES) if (re.test(n)) return pt;
  return null;
}

export interface StageInput {
  id: string;
  name: string;
  label: string;
  projectId: string;
  projectName: string;
  status: string | null;
  plannedHours: number | null;
  plannedCost: number | null;
  actualHours: number;
  actualCost: number;
  baselineStart: string | null;
  baselineEnd: string | null;
  start: string | null;
  end: string | null;
  phaseType: PhaseType | null;
}

export interface StageRow extends StageInput {
  hoursPct: number | null;
  costPct: number | null;
  plannedDays: number | null;
  actualDays: number | null;
}

export interface PhaseSummary {
  type: PhaseType;
  count: number;
  plannedHours: number;
  actualHours: number;
  hoursPct: number | null;
  plannedCost: number;
  actualCost: number;
  costPct: number | null;
  best: number | null;
  median: number | null;
  worst: number | null;
  plannedDaysAvg: number | null;
  actualDaysAvg: number | null;
  durationCount: number;
  stages: StageRow[];
}

const variance = (planned: number | null, actual: number) =>
  planned && planned > 0 ? ((actual - planned) / planned) * 100 : null;
const days = (a: string | null, b: string | null) =>
  a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1 : null;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The overrun used for ranking: hours % when estimated, else cost %. */
export const overrun = (r: StageRow) => r.hoursPct ?? r.costPct;

export function toStageRow(s: StageInput): StageRow {
  return {
    ...s,
    hoursPct: variance(s.plannedHours, s.actualHours),
    costPct: variance(s.plannedCost, s.actualCost),
    plannedDays: days(s.baselineStart, s.baselineEnd),
    actualDays: s.status === "done" ? days(s.start, s.end) : null,
  };
}

export function summarise(rows: StageRow[]): PhaseSummary[] {
  return PHASE_TYPES.map((type) => {
    const st = rows.filter((r) => r.phaseType === type).sort((a, b) => (overrun(b) ?? -Infinity) - (overrun(a) ?? -Infinity));
    const pH = st.reduce((a, r) => a + (r.plannedHours ?? 0), 0);
    const aH = st.reduce((a, r) => a + r.actualHours, 0);
    const pC = st.reduce((a, r) => a + (r.plannedCost ?? 0), 0);
    const aC = st.reduce((a, r) => a + r.actualCost, 0);
    const ov = st.map(overrun).filter((x): x is number => x != null);
    const dur = st.filter((r) => r.plannedDays != null && r.actualDays != null);
    return {
      type,
      count: st.length,
      plannedHours: pH,
      actualHours: aH,
      hoursPct: variance(pH, aH),
      plannedCost: pC,
      actualCost: aC,
      costPct: variance(pC, aC),
      best: ov.length ? Math.min(...ov) : null,
      median: median(ov),
      worst: ov.length ? Math.max(...ov) : null,
      durationCount: dur.length,
      plannedDaysAvg: dur.length ? dur.reduce((a, r) => a + (r.plannedDays ?? 0), 0) / dur.length : null,
      actualDaysAvg: dur.length ? dur.reduce((a, r) => a + (r.actualDays ?? 0), 0) / dur.length : null,
      stages: st,
    };
  });
}
