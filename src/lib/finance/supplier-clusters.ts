/**
 * Pure, read-only supplier duplicate clustering. Suggestions only: merging
 * still goes through fin_merge_companies after a person confirms.
 */
const LEGAL = new Set([
  "lda", "limitada", "unipessoal", "sa", "inc", "incorporated", "ltd", "limited", "llc", "pbc",
  "gmbh", "bv", "plc", "sl", "srl", "corp", "corporation", "co", "company", "ag", "nv", "sas", "sarl",
]);
const GENERIC_BANK = new Set([
  "COMPRA", "PAGAMENTO", "PAG", "TRF", "TRANSF", "SEPA", "DD", "DEB", "DEBITO", "DIRECTO", "CARTAO",
  "COM", "WWW", "HTTPS", "HTTP", "LDA", "INC", "LTD", "EUR", "MBWAY", "MB", "WAY", "LEV", "IMPOSTO", "SELO",
]);

export function normalizeSupplierName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bs\.\s?a\.?/g, " sa ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const toks = base.split(" ").filter(Boolean);
  while (toks.length > 1 && LEGAL.has(toks[toks.length - 1])) toks.pop();
  return toks.filter((t) => !LEGAL.has(t) || toks.length === 1).join(" ");
}

export const nifKey = (v: string | null | undefined) =>
  (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PT(?=\d{9}$)/, "") || null;

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
const ratio = (a: string, b: string) => 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);

/** 0..1 similarity; >= 0.8 counts as "very similar". */
export function nameSimilarity(na: string, nb: string): number {
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const whole = ratio(na, nb);
  const ta = na.split(" ").map(stem), tb = nb.split(" ").map(stem);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // Same leading word, and every word of the shorter name fuzzily present in the longer one.
  if (short[0].length >= 4 && ratio(short[0], long[0]) >= 0.85
    && short.every((t) => long.some((u) => ratio(t, u) >= 0.8))) {
    return Math.max(whole, 0.85);
  }
  return whole;
}

/** Stable merchant key from a bank description, e.g. "MDB8022 LOVABLE" -> "LOVABLE". */
export function bankPatternKey(desc: string | null | undefined): string | null {
  const toks = (desc ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/).filter((t) => !/\d/.test(t))
    .flatMap((t) => t.split(/[^A-Z]+/)).filter((t) => t.length >= 3 && !GENERIC_BANK.has(t));
  return toks.length ? toks.slice(0, 2).join(" ") : null;
}

export type ClusterCompany = { id: string; name: string; nif: string | null; bankDescriptions: string[] };
export type EdgeReason = "same_nif" | "same_name" | "similar_name" | "bank_pattern";
export type ClusterEdge = { a: string; b: string; reason: EdgeReason; confidence: number; detail: string };

export function buildSupplierClusters(
  companies: ClusterCompany[],
  notDuplicatePairs: Array<[string, string]> = [],
): Array<{ ids: string[]; edges: ClusterEdge[]; confidence: number }> {
  const blocked = new Set(notDuplicatePairs.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  const info = companies.map((c) => ({
    ...c,
    norm: normalizeSupplierName(c.name),
    nk: nifKey(c.nif),
    pats: new Set(c.bankDescriptions.map(bankPatternKey).filter((x): x is string => !!x)),
  }));
  // Patterns used by many companies are too generic to mean anything.
  const patOwners = new Map<string, number>();
  for (const c of info) for (const p of c.pats) patOwners.set(p, (patOwners.get(p) ?? 0) + 1);

  const edges: ClusterEdge[] = [];
  for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) {
    const a = info[i], b = info[j];
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (blocked.has(key)) continue;
    let e: ClusterEdge | null = null;
    if (a.nk && a.nk === b.nk) e = { a: a.id, b: b.id, reason: "same_nif", confidence: 95, detail: a.nk };
    else if (a.norm.length >= 3 && a.norm === b.norm) e = { a: a.id, b: b.id, reason: "same_name", confidence: 90, detail: a.norm };
    else {
      const sim = nameSimilarity(a.norm, b.norm);
      const shared = [...a.pats].find((p) => b.pats.has(p) && (patOwners.get(p) ?? 0) <= 4);
      if (shared && sim >= 0.5) e = { a: a.id, b: b.id, reason: "bank_pattern", confidence: 85, detail: shared };
      else if (sim >= 0.8 && Math.min(a.norm.length, b.norm.length) >= 4)
        e = { a: a.id, b: b.id, reason: "similar_name", confidence: Math.round(55 + sim * 30), detail: `${Math.round(sim * 100)}%` };
      else if (shared) e = { a: a.id, b: b.id, reason: "bank_pattern", confidence: 70, detail: shared };
    }
    if (e) edges.push(e);
  }
  const parent = new Map(info.map((c) => [c.id, c.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const e of edges) parent.set(find(e.a), find(e.b));
  const groups = new Map<string, string[]>();
  for (const c of info) {
    const r = find(c.id);
    groups.set(r, [...(groups.get(r) ?? []), c.id]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map((ids) => {
    const es = edges.filter((e) => ids.includes(e.a));
    return { ids, edges: es, confidence: Math.max(...es.map((e) => e.confidence)) };
  }).sort((x, y) => y.confidence - x.confidence || y.ids.length - x.ids.length);
}

export type ClusterDoc = { id: string; companyId: string; entityId: string; number: string | null; date: string | null; total: number };
/** Purchases in one cluster with the same amount and dates within 3 days. */
export function clusterPurchasePairs(docs: ClusterDoc[], maxDays = 3) {
  const out: Array<[ClusterDoc, ClusterDoc]> = [];
  const s = [...docs].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    const a = s[i], b = s[j];
    if (!a.date || !b.date || a.entityId !== b.entityId) continue;
    if (Math.abs(Date.parse(b.date) - Date.parse(a.date)) / 86_400_000 > maxDays) continue;
    if (Math.abs(Number(a.total) - Number(b.total)) < 0.005) out.push([a, b]);
  }
  return out;
}
