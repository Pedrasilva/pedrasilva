/**
 * Pure helpers for ranking categories in the classification picker/browser.
 * - learnedClassificationIds: every category whose learned bank rule matches the
 *   movement description, in rule priority order (applyRules only returns the first).
 * - rankForBrowser: learned/suggested first, then search relevance (code, name, PT name).
 */

export type LearnedRule = {
  match_type: string;
  pattern: string;
  case_sensitive: boolean;
  classification_id: string | null;
  priority: number;
  active: boolean;
};

export type RankableCategory = { id: string; code: string; name_pt: string; name_en: string };

function ruleHits(r: LearnedRule, text: string): boolean {
  const target = r.case_sensitive ? text : text.toLowerCase();
  const pat = r.case_sensitive ? r.pattern : r.pattern.toLowerCase();
  switch (r.match_type) {
    case "contains": return target.includes(pat);
    case "starts_with": return target.startsWith(pat);
    case "ends_with": return target.endsWith(pat);
    case "equals": return target === pat;
    case "regex":
      try { return new RegExp(r.pattern, r.case_sensitive ? "" : "i").test(text); } catch { return false; }
    default: return false;
  }
}

export function learnedClassificationIds(text: string | null | undefined, rules: LearnedRule[]): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const r of [...rules].filter((x) => x.active && x.classification_id).sort((a, b) => a.priority - b.priority)) {
    if (ruleHits(r, text) && !out.includes(r.classification_id!)) out.push(r.classification_id!);
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** 0 = best. 99 = no match. Matches code, current-language name and the other name, accent-insensitive. */
export function searchScore(query: string, c: RankableCategory, isPt: boolean): number {
  const q = fold(query.trim());
  if (!q) return 0;
  const code = fold(c.code);
  const name = fold(isPt ? c.name_pt : c.name_en);
  const alt = fold(isPt ? c.name_en : c.name_pt);
  if (code.startsWith(q)) return 0;
  if (name.startsWith(q)) return 1;
  if (alt.startsWith(q)) return 2;
  if (code.includes(q)) return 3;
  if (name.includes(q)) return 4;
  if (alt.includes(q)) return 5;
  return 99;
}

export function rankForBrowser<T extends RankableCategory>(
  rows: T[], query: string, isPt: boolean, suggestedIds: string[] = [],
): T[] {
  const sugg = new Map(suggestedIds.map((id, i) => [id, i]));
  return rows
    .map((r) => ({ r, s: searchScore(query, r, isPt) }))
    .filter((x) => x.s < 99)
    .sort((a, b) => {
      const sa = sugg.has(a.r.id) ? sugg.get(a.r.id)! : Infinity;
      const sb = sugg.has(b.r.id) ? sugg.get(b.r.id)! : Infinity;
      if (sa !== sb) return sa - sb;
      return a.s - b.s || a.r.code.localeCompare(b.r.code);
    })
    .map((x) => x.r);
}
