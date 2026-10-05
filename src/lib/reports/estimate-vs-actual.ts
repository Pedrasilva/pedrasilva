/**
 * Estimate vs actual per phase type — pure calculation (no Supabase calls).
 *
 * planned hours / € = first available of: sold quote stage, current plan, locked baseline
 * actual hours / € = stageActuals() from budget-consumption.ts (locked cost-rate
 * snapshots). Only own-work (is_self) leaf stages are passed in.
 */
export const PHASE_TYPES = [
  "management", "programme", "concept", "developed", "technical", "tender",
  "construction", "licensing", "interiors", "closeout", "singleProject",
] as const;
export type PhaseType = (typeof PHASE_TYPES)[number];

export const ESTIMATE_SOURCES = ["quote", "plan", "baseline"] as const;
export type EstimateSource = (typeof ESTIMATE_SOURCES)[number];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** 1. Keywords in the name (accent-free, lower-case), by meaning. First match wins. */
const NAME_RULES: [RegExp, PhaseType][] = [
  [/\b(programa|programme|program)\b/, "programme"],
  [/\b(concept|conceito|estudo previo)\b/, "concept"],
  [/\b(developed|anteprojecto|anteprojeto)\b/, "developed"],
  [/\b(technical|execucao)\b/, "technical"],
  [/\b(tender|concurso)\b/, "tender"],
  [/\b(construction|construcao|obra|assistencia|avenca)\b/, "construction"],
  [/\b(licenciamento|comunicacao previa)\b/, "licensing"],
  [/\b(mobiliario|interiores)\b/, "interiors"],
  [/\b(gestao|management)\b/, "management"],
  [/\b(close ?out|telas finais|encerramento)\b/, "closeout"],
];
const PREFIX: Record<string, PhaseType> = {
  "0": "management", "1": "concept", "2": "developed", "3": "technical", "4": "tender", "5": "construction", "6": "closeout",
};

export function phaseTypeFromKeywords(name: string | null | undefined): PhaseType | null {
  if (!name) return null;
  const n = norm(name);
  if (/final-stage support/.test(n)) return "construction";
  for (const [re, pt] of NAME_RULES) if (re.test(n)) return pt;
  return null;
}
export function phaseTypeFromPrefix(name: string | null | undefined): PhaseType | null {
  const m = name ? /^\s*f\s*([0-6])(?![0-9])/i.exec(name) : null;
  return m ? PREFIX[m[1]] : null;
}

/**
 * Mapping order: 1. keywords in the name; 2. the parent's type; 3. the
 * F-number prefix; 4. a single all-in-one "Projecto" stage. Else unmapped.
 */
export function resolvePhaseType<T extends { name: string; parent_stage_id: string | null }>(
  s: T,
  parentOf: (s: T) => T | undefined,
): PhaseType | null {
  const kw = phaseTypeFromKeywords(s.name);
  if (kw) return kw;
  const parent = parentOf(s);
  const pt = parent ? resolvePhaseType(parent, parentOf) : null;
  if (pt) return pt;
  const pre = phaseTypeFromPrefix(s.name);
  if (pre) return pre;
  if (/^projec?to$/.test(norm(s.name))) return "singleProject";
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
  source: EstimateSource | null;
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
