// Pure helpers for Instagram insights (no network, no secrets) — unit-tested.

export const MEDIA_METRICS: Record<"FEED" | "REELS" | "STORY", string[]> = {
  FEED: ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "profile_visits", "follows"],
  REELS: ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"],
  STORY: ["reach", "views", "replies", "shares", "total_interactions", "profile_visits", "follows", "navigation"],
};
export const ACCOUNT_METRICS = ["reach", "views", "profile_views", "accounts_engaged", "total_interactions", "follows_and_unfollows"];

export type Format = "single" | "carousel" | "reel" | "story";
export function formatOf(mediaType?: string | null, productType?: string | null): Format {
  if (productType === "STORY") return "story";
  if (productType === "REELS" || mediaType === "VIDEO") return "reel";
  if (mediaType === "CAROUSEL_ALBUM") return "carousel";
  return "single";
}
export function metricSet(productType?: string | null, mediaType?: string | null) {
  if (productType === "STORY") return MEDIA_METRICS.STORY;
  if (productType === "REELS" || mediaType === "VIDEO") return MEDIA_METRICS.REELS;
  return MEDIA_METRICS.FEED;
}

/** Reads Graph insights responses (both `values` and `total_value` shapes). */
export function parseInsights(resp: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = (resp as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return out;
  for (const row of data as Array<Record<string, any>>) {
    const name = typeof row.name === "string" ? row.name : null;
    if (!name) continue;
    const v = row.total_value?.value ?? (Array.isArray(row.values) ? row.values[row.values.length - 1]?.value : undefined);
    if (typeof v === "number" && Number.isFinite(v)) out[name] = v;
    else if (v && typeof v === "object") {
      const sum = Object.values(v as Record<string, unknown>).reduce<number>((a, x) => a + (typeof x === "number" ? x : 0), 0);
      out[name] = sum;
    }
  }
  return out;
}

/** True for Meta errors that mean "metric not supported" (deprecated/invalid for this media). */
export function isUnsupportedMetricError(code: string) { return code === "100" || code === "10"; }

/** Tries all metrics at once; on an unsupported-metric error falls back to one-by-one and records the skipped ones. */
export async function collectMetrics(fetchOne: (metrics: string[]) => Promise<unknown>, metrics: string[], errCode: (e: unknown) => string) {
  try { return { metrics: parseInsights(await fetchOne(metrics)), unavailable: [] as string[] }; }
  catch (e) {
    if (!isUnsupportedMetricError(errCode(e))) throw e;
    const out: Record<string, number> = {}; const unavailable: string[] = [];
    for (const m of metrics) {
      try { Object.assign(out, parseInsights(await fetchOne([m]))); }
      catch (e2) { if (!isUnsupportedMetricError(errCode(e2))) throw e2; unavailable.push(m); }
    }
    return { metrics: out, unavailable };
  }
}

export type PostRow = {
  media_id: string; captured_on: string; media_type: string | null; media_product_type: string | null; caption: string | null;
  posted_at: string | null; draft_id: string | null; metrics: Record<string, number>; permalink?: string | null; thumbnail?: string | null;
};
export type DraftMeta = { id: string; ig_media_id: string | null; project_id: string | null; project_name?: string | null; pillar: string | null };

/** Latest snapshot per media. */
export function latestPerMedia(rows: PostRow[]) {
  const m = new Map<string, PostRow>();
  for (const r of rows) { const p = m.get(r.media_id); if (!p || r.captured_on > p.captured_on) m.set(r.media_id, r); }
  return [...m.values()].sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
}

export function engagement(m: Record<string, number>) {
  return (m.likes ?? 0) + (m.comments ?? 0) + (m.saved ?? 0) + (m.shares ?? 0);
}
export function engagementRate(m: Record<string, number>) { return m.reach ? engagement(m) / m.reach : null; }

const LISBON_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short" });
const LISBON_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hourCycle: "h23" });
export function slotOf(iso: string | null) {
  if (!iso) return { day: "—", band: "—" };
  const d = new Date(iso); const h = Number(LISBON_HOUR.format(d));
  return { day: LISBON_DAY.format(d), band: h < 12 ? "morning" : h < 17 ? "afternoon" : "evening" };
}

export type Group = { key: string; posts: number; reach: number; views: number; engagement: number; avgReach: number; avgEngagementRate: number | null };
export function groupBy(posts: PostRow[], keyOf: (p: PostRow) => string): Group[] {
  const g = new Map<string, PostRow[]>();
  for (const p of posts) { const k = keyOf(p) || "—"; g.set(k, [...(g.get(k) ?? []), p]); }
  return [...g.entries()].map(([key, list]) => {
    const reach = list.reduce((a, p) => a + (p.metrics.reach ?? 0), 0);
    const views = list.reduce((a, p) => a + (p.metrics.views ?? 0), 0);
    const eng = list.reduce((a, p) => a + engagement(p.metrics), 0);
    const rates = list.map((p) => engagementRate(p.metrics)).filter((x): x is number => x != null);
    return { key, posts: list.length, reach, views, engagement: eng, avgReach: Math.round(reach / list.length), avgEngagementRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null };
  }).sort((a, b) => b.avgReach - a.avgReach);
}

/**
 * Builds the only payload sent to Claude: aggregated metrics + captions/metadata of our own posts.
 * Never includes commenter usernames, comment text, tokens or account IDs.
 */
export function buildAnalysisInput(posts: PostRow[], drafts: DraftMeta[], account: Array<{ captured_on: string; followers: number | null }>) {
  const byMedia = new Map(drafts.filter((d) => d.ig_media_id).map((d) => [d.ig_media_id!, d]));
  const enriched = posts.map((p) => {
    const d = byMedia.get(p.media_id);
    return { ...p, format: formatOf(p.media_type, p.media_product_type), project: d?.project_name ?? null, pillar: d?.pillar ?? null, ...slotOf(p.posted_at) };
  });
  const pick = (m: Record<string, number>) => Object.fromEntries(["reach", "views", "likes", "comments", "saved", "shares", "profile_visits", "follows", "ig_reels_avg_watch_time"].filter((k) => k in m).map((k) => [k, m[k]]));
  const fol = account.filter((a) => a.followers != null).sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  return {
    postCount: enriched.length,
    followers: fol.length ? { first: fol[0].followers, last: fol[fol.length - 1].followers, from: fol[0].captured_on, to: fol[fol.length - 1].captured_on } : null,
    posts: enriched.slice(0, 60).map((p) => ({
      postedAt: p.posted_at, format: p.format, project: p.project, pillar: p.pillar, day: p.day, band: p.band,
      caption: (p.caption ?? "").replace(/@[\w.]+/g, "@…").slice(0, 400), metrics: pick(p.metrics),
    })),
    byFormat: groupBy(enriched, (p) => formatOf(p.media_type, p.media_product_type)),
    byPillar: groupBy(enriched, (p) => byMedia.get(p.media_id)?.pillar ?? "—"),
    byProject: groupBy(enriched, (p) => byMedia.get(p.media_id)?.project_name ?? "—"),
    byDay: groupBy(enriched, (p) => slotOf(p.posted_at).day),
    byBand: groupBy(enriched, (p) => slotOf(p.posted_at).band),
  };
}

export type AnalysisResult = { working: string[]; notWorking: string[]; recommendations: string[] };
export function parseAnalysis(text: string): AnalysisResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Analysis unreadable");
  const j = JSON.parse(m[0]);
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((s) => typeof s === "string").map((s) => s.slice(0, 600)) : []);
  const out = { working: arr(j.working), notWorking: arr(j.notWorking), recommendations: arr(j.recommendations).slice(0, 5) };
  if (out.recommendations.length < 3) throw new Error("Analysis incomplete");
  return out;
}
