/**
 * Distinct colours for projects on the weekly board (display only, never saved).
 * A project keeps its own colour when no other project on the board uses it;
 * shared or default colours get the next unused colour from the palette.
 */
export const WEEK_PROJECT_PALETTE = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#0d9488", "#9333ea", "#ca8a04",
  "#4f46e5", "#be123c", "#059669", "#a16207",
];
const DEFAULT_COLOURS = new Set(["#3b82f6", ""]);

export function weekProjectColours(projects: { id: string; name: string; color?: string | null }[]): Map<string, string> {
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const norm = (c?: string | null) => (c ?? "").trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const p of sorted) counts.set(norm(p.color), (counts.get(norm(p.color)) ?? 0) + 1);
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const p of sorted) {
    const c = norm(p.color);
    if (!DEFAULT_COLOURS.has(c) && counts.get(c) === 1) { out.set(p.id, c); used.add(c); }
  }
  let i = 0;
  for (const p of sorted) {
    if (out.has(p.id)) continue;
    while (i < WEEK_PROJECT_PALETTE.length && used.has(WEEK_PROJECT_PALETTE[i])) i++;
    const c = WEEK_PROJECT_PALETTE[i % WEEK_PROJECT_PALETTE.length] ?? WEEK_PROJECT_PALETTE[0];
    i++;
    out.set(p.id, c); used.add(c);
  }
  return out;
}
