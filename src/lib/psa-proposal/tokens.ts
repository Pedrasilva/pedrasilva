/**
 * Merge tokens for PSA Proposal rich-text blocks.
 *
 * Users type `{{token}}` inside any Custom Text / library block; at render
 * time tokens are replaced with values pulled from the live Quote snapshot.
 *
 * Unknown tokens render as "—" (so the document stays clean) and are
 * returned in `unresolved` so the UI can flag them.
 */
import {
  type LiveQuoteSnapshot,
  formatCurrencyEUR,
  formatDatePT,
  formatDurationAdaptive,
} from "./live-data";

export interface TokenCatalogEntry {
  token: string;
  label: string;
  example?: string;
  group: "Projecto" | "Cliente" | "Totais" | "Programa" | "Fases";
}

/** Static token catalogue (per-stage tokens listed dynamically in the picker). */
export const STATIC_TOKEN_CATALOG: TokenCatalogEntry[] = [
  { token: "project_name", label: "Nome do projecto", group: "Projecto" },
  { token: "project_number", label: "Número do projecto", group: "Projecto" },
  { token: "project_description", label: "Descrição do projecto", group: "Projecto" },
  { token: "proposal_date", label: "Data da proposta", group: "Projecto" },
  { token: "client_name", label: "Cliente", group: "Cliente" },
  { token: "architecture_total", label: "Total honorários (arquitectura)", group: "Totais" },
  { token: "suppliers_total", label: "Total consultores", group: "Totais" },
  { token: "grand_total", label: "Total geral", group: "Totais" },
  { token: "vat_status", label: "Estado IVA", group: "Totais" },
  { token: "overall_duration", label: "Duração total", group: "Programa" },
  { token: "project_start", label: "Início do projecto", group: "Programa" },
  { token: "project_end", label: "Fim do projecto", group: "Programa" },
];

/**
 * Build the full token → value map from a live snapshot.
 * Per-stage tokens are emitted using either the stage `code` (e.g. A2) or a
 * `stage_<n>` positional fallback when code is missing.
 */
export function buildTokenMap(
  live: LiveQuoteSnapshot | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!live) return map;

  map.project_name = live.projectName ?? "—";
  map.project_number = live.projectNumber ?? "—";
  map.project_description = live.projectDescription ?? "—";
  map.proposal_date = formatDatePT(live.date);
  map.client_name = live.client ?? "—";
  map.vat_status = live.vatStatus ?? "—";

  const archTotal = live.totalArchitectureFee ?? 0;
  const supTotal = (live.consultants ?? []).reduce(
    (s, c) => s + (Number(c.fee) || 0),
    0,
  );
  map.architecture_total = formatCurrencyEUR(archTotal || null);
  map.suppliers_total = formatCurrencyEUR(supTotal || null);
  map.grand_total = formatCurrencyEUR((archTotal + supTotal) || null);

  // Programme dates from the union of stage ranges.
  const selfStages = (live.stages ?? []).filter((s) => s.isSelf);
  const starts = selfStages.map((s) => s.startDate).filter(Boolean) as string[];
  const ends = selfStages.map((s) => s.endDate).filter(Boolean) as string[];
  const minStart = starts.length ? starts.sort()[0] : null;
  const maxEnd = ends.length ? ends.sort().slice(-1)[0] : null;
  map.project_start = formatDatePT(minStart);
  map.project_end = formatDatePT(maxEnd);
  const totalDays = selfStages.reduce(
    (sum, s) => sum + (s.durationDays ?? 0),
    0,
  );
  map.overall_duration = totalDays > 0 ? formatDurationAdaptive(totalDays) : "—";

  // Per-stage tokens: by code (A2) and by sort index (stage_1, stage_2 …).
  (live.stages ?? []).forEach((s, i) => {
    const keys: string[] = [];
    if (s.code) keys.push(s.code.toLowerCase());
    keys.push(`stage_${i + 1}`);
    for (const k of keys) {
      map[`stage.${k}.name`] = s.name ?? "—";
      map[`stage.${k}.fee`] = formatCurrencyEUR(s.fee);
      map[`stage.${k}.duration`] = formatDurationAdaptive(s.durationDays);
      map[`stage.${k}.start`] = formatDatePT(s.startDate);
      map[`stage.${k}.end`] = formatDatePT(s.endDate);
    }
  });

  return map;
}

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export interface ResolveTokensResult {
  output: string;
  resolved: string[];
  unresolved: string[];
}

/** Resolve `{{token}}` occurrences in a string (HTML or plain text). */
export function resolveTokens(
  input: string,
  map: Record<string, string>,
): ResolveTokensResult {
  const resolved = new Set<string>();
  const unresolved = new Set<string>();
  const output = input.replace(TOKEN_RE, (_full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      resolved.add(key);
      return escapeHtml(map[key] ?? "—");
    }
    unresolved.add(key);
    return `<span class="psa-token-unresolved" title="Token não encontrado: ${key}">{{${key}}}</span>`;
  });
  return {
    output,
    resolved: [...resolved],
    unresolved: [...unresolved],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Catalogue entries augmented with available per-stage tokens. */
export function buildTokenPickerEntries(
  live: LiveQuoteSnapshot | undefined,
): TokenCatalogEntry[] {
  const entries = [...STATIC_TOKEN_CATALOG];
  (live?.stages ?? []).forEach((s, i) => {
    const code = s.code ? s.code.toLowerCase() : `stage_${i + 1}`;
    const label = s.name || s.code || `Fase ${i + 1}`;
    entries.push(
      { token: `stage.${code}.name`, label: `${label} — nome`, group: "Fases" },
      { token: `stage.${code}.fee`, label: `${label} — honorário`, group: "Fases" },
      { token: `stage.${code}.duration`, label: `${label} — duração`, group: "Fases" },
      { token: `stage.${code}.start`, label: `${label} — início`, group: "Fases" },
      { token: `stage.${code}.end`, label: `${label} — fim`, group: "Fases" },
    );
  });
  return entries;
}
