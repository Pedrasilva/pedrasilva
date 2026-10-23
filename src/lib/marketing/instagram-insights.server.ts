import { instagramGraph, InstagramError } from "./instagram-graph.server";
import { ACCOUNT_METRICS, buildAnalysisInput, collectMetrics, metricSet, parseAnalysis, storyReadDue, MEDIA_METRICS, type DraftMeta, type PostRow } from "./instagram-insights";

type Graph = ReturnType<typeof instagramGraph>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function admin(): Promise<Db> { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
function token() { const t = process.env["META_SYSTEM_USER_TOKEN"]; if (!t) throw new InstagramError("Instagram connection unavailable", "connection"); return t; }
const code = (e: unknown) => (e instanceof InstagramError ? e.code : "unknown");
export const lisbonDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(d);
const MEDIA_FIELDS = "id,media_type,media_product_type,caption,permalink,thumbnail_url,media_url,timestamp";

/** Read-only Graph calls; one snapshot per post and per account per Lisbon day (re-runs overwrite that day). */
export async function syncInstagramInsights(opts: { graph?: Graph; db?: Db; now?: Date } = {}) {
  const db = opts.db ?? await admin();
  const { data: s } = await db.from("marketing_settings").select("instagram_account_id").eq("id", true).single();
  if (!s?.instagram_account_id) return { posts: 0, error: "connectionUnavailable" };
  const ig = s.instagram_account_id as string;
  const graph = opts.graph ?? instagramGraph(token());
  const day = lisbonDay(opts.now);
  const feed = await graph(`${ig}/media?fields=${MEDIA_FIELDS}&limit=50`);
  let stories: any[] = [];
  try { stories = (await graph(`${ig}/stories?fields=${MEDIA_FIELDS}`)).data ?? []; } catch { /* stories optional */ }
  const media = [...(Array.isArray(feed.data) ? feed.data : []), ...stories];
  const ids = media.map((m) => String(m.id));
  const { data: drafts } = ids.length ? await db.from("marketing_post_drafts").select("id,ig_media_id").in("ig_media_id", ids) : { data: [] };
  const draftBy = new Map((drafts ?? []).map((d: any) => [d.ig_media_id, d.id]));
  let posts = 0, failed = 0;
  for (const m of media) {
    try {
      const r = await collectMetrics((ms) => graph(`${m.id}/insights?metric=${ms.join(",")}`), metricSet(m.media_product_type, m.media_type), code);
      const { error } = await db.from("marketing_ig_media_insights").upsert({
        media_id: String(m.id), captured_on: day, media_type: m.media_type ?? null, media_product_type: m.media_product_type ?? null,
        caption: m.caption ?? null, permalink: m.permalink ?? null, thumbnail: m.thumbnail_url ?? m.media_url ?? null,
        posted_at: m.timestamp ?? null, draft_id: draftBy.get(String(m.id)) ?? null, metrics: r.metrics, unavailable_metrics: r.unavailable,
        captured_at: new Date().toISOString(),
      }, { onConflict: "media_id,captured_on" });
      if (error) throw error;
      posts++;
    } catch { failed++; }
  }
  let accountOk = true;
  try {
    const prof = await graph(`${ig}?fields=followers_count`);
    const since = Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) - 86400;
    const r = await collectMetrics((ms) => graph(`${ig}/insights?metric=${ms.join(",")}&period=day&metric_type=total_value&since=${since}&until=${since + 86400}`), ACCOUNT_METRICS, code);
    const { error } = await db.from("marketing_ig_account_insights").upsert({ captured_on: day, followers: typeof prof.followers_count === "number" ? prof.followers_count : null, metrics: r.metrics, unavailable_metrics: r.unavailable, captured_at: new Date().toISOString() }, { onConflict: "captured_on" });
    if (error) throw error;
  } catch { accountOk = false; }
  const err = failed || !accountOk ? "insightsPartial" : null;
  await db.from("marketing_settings").update({ instagram_insights_synced_at: new Date().toISOString(), instagram_insights_error: err }).eq("id", true);
  return { posts, failed, account: accountOk, error: err };
}

/** Runs from the existing 15-minute job; only does work once per ~day. */
export async function syncInstagramInsightsIfStale() {
  const db = await admin();
  const { data: s } = await db.from("marketing_settings").select("instagram_insights_synced_at").eq("id", true).single();
  if (s?.instagram_insights_synced_at && Date.now() - Date.parse(s.instagram_insights_synced_at) < 23 * 3600_000) return { skipped: true };
  return syncInstagramInsights({ db });
}

/**
 * Stories expire after 24 h: on the 15-minute job, read each live Story (ours from drafts + any in /stories)
 * once at 20–23 h and a final time before expiry. Read-only; stored in the same snapshot table.
 */
export async function syncStoryInsightsIfDue(opts: { graph?: Graph; db?: Db; now?: Date } = {}) {
  const db = opts.db ?? await admin();
  const now = opts.now ?? new Date();
  const { data: s } = await db.from("marketing_settings").select("instagram_account_id").eq("id", true).single();
  if (!s?.instagram_account_id) return { stories: 0, read: 0 };
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data: ours } = await db.from("marketing_post_drafts").select("id,ig_media_id,published_at").eq("format", "story").not("ig_media_id", "is", null).gte("published_at", since);
  const cands = new Map<string, { id: string; posted_at: string | null; draft_id: string | null; m?: any }>();
  for (const d of ours ?? []) cands.set(String(d.ig_media_id), { id: String(d.ig_media_id), posted_at: d.published_at, draft_id: d.id });
  // Only call Meta when at least one of our Stories is due, or to discover Stories published outside the Hub.
  let graph: Graph | null = null;
  const g = () => (graph ??= opts.graph ?? instagramGraph(token()));
  try {
    const live = (await g()(`${s.instagram_account_id}/stories?fields=${MEDIA_FIELDS}`)).data ?? [];
    for (const m of live) { const id = String(m.id); const c = cands.get(id); cands.set(id, { id, posted_at: m.timestamp ?? c?.posted_at ?? null, draft_id: c?.draft_id ?? null, m }); }
  } catch { /* live list optional; drafts still covered */ }
  if (!cands.size) return { stories: 0, read: 0 };
  const { data: snaps } = await db.from("marketing_ig_media_insights").select("media_id,captured_at").in("media_id", [...cands.keys()]);
  const last = new Map<string, string>();
  for (const r of snaps ?? []) if (!last.has(r.media_id) || r.captured_at > last.get(r.media_id)!) last.set(r.media_id, r.captured_at);
  let read = 0;
  for (const c of cands.values()) {
    if (!storyReadDue(c.posted_at, last.get(c.id) ?? null, now)) continue;
    try {
      const r = await collectMetrics((ms) => g()(`${c.id}/insights?metric=${ms.join(",")}`), MEDIA_METRICS.STORY, code);
      const m = c.m ?? {};
      const { error } = await db.from("marketing_ig_media_insights").upsert({
        media_id: c.id, captured_on: lisbonDay(now), media_type: m.media_type ?? null, media_product_type: "STORY",
        caption: m.caption ?? null, permalink: m.permalink ?? null, thumbnail: m.thumbnail_url ?? m.media_url ?? null,
        posted_at: c.posted_at, draft_id: c.draft_id, metrics: r.metrics, unavailable_metrics: r.unavailable, captured_at: now.toISOString(),
      }, { onConflict: "media_id,captured_on" });
      if (!error) read++;
    } catch { /* expired or unavailable — skip */ }
  }
  return { stories: cands.size, read };
}

/** Claude analysis on aggregated metrics + our own captions/metadata only. Result is saved; nothing is acted on. */
export async function analyseInsights(actorId: string, ask: (system: string, user: string) => Promise<string>, model: string, db?: Db) {
  const sb = db ?? await admin();
  const [{ data: rows }, { data: acc }] = await Promise.all([
    sb.from("marketing_ig_media_insights").select("media_id,captured_on,media_type,media_product_type,caption,posted_at,draft_id,metrics").order("captured_on", { ascending: false }).limit(2000),
    sb.from("marketing_ig_account_insights").select("captured_on,followers").order("captured_on", { ascending: true }).limit(400),
  ]);
  const { latestPerMedia } = await import("./instagram-insights");
  const posts = latestPerMedia((rows ?? []) as PostRow[]);
  if (!posts.length) throw new Error("No insights yet");
  const ids = posts.map((p) => p.media_id);
  const { data: d } = await sb.from("marketing_post_drafts").select("id,ig_media_id,project_id,pillar").in("ig_media_id", ids);
  const pids = [...new Set((d ?? []).map((x: any) => x.project_id).filter(Boolean))];
  const { data: projs } = pids.length ? await sb.from("pm_projects").select("id,name").in("id", pids) : { data: [] };
  const pname = new Map((projs ?? []).map((p: any) => [p.id, p.name]));
  const drafts: DraftMeta[] = (d ?? []).map((x: any) => ({ ...x, project_name: x.project_id ? pname.get(x.project_id) ?? null : null }));
  const input = buildAnalysisInput(posts, drafts, acc ?? []);
  const { getActiveMarketingBible } = await import("./bible.server");
  const bible = await getActiveMarketingBible();
  const system = `You are the marketing analyst for Pedra Silva Arquitectos, an architecture studio. Positioning and tone come from this Marketing Bible:\n${(bible?.content_md ?? "").slice(0, 8000)}\n\nAnalyse the Instagram performance data. Be specific and evidence-based (cite formats, pillars, days, numbers). Small samples must be flagged as tentative. Respond ONLY with JSON: {"working": string[], "notWorking": string[], "recommendations": string[] (3 to 5 concrete actions for the next weeks, aligned with the Bible)}. Write in English.`;
  const result = parseAnalysis(await ask(system, JSON.stringify(input)));
  const dates = posts.map((p) => p.posted_at).filter(Boolean).sort() as string[];
  const { data: saved, error } = await sb.from("marketing_insight_analyses").insert({
    created_by: actorId, model, post_count: posts.length, period_from: dates[0]?.slice(0, 10) ?? null, period_to: dates[dates.length - 1]?.slice(0, 10) ?? null,
    result, input_summary: { byFormat: input.byFormat, byPillar: input.byPillar, followers: input.followers },
  }).select("id").single();
  if (error) throw error;
  return { id: saved.id, result };
}
