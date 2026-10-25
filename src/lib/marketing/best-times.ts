import { engagementRate, latestPerMedia, type PostRow } from './instagram-insights';
import { lisbonParts } from './calendar';

export const POSTING_HOURS = Array.from({ length: 17 }, (_, i) => i + 7);
export const MIN_POSTS = 5;
export type TimingFormat = 'feed' | 'story';
export type ActivitySlot = { weekday: number; hour: number; value: number };
export type ActivitySnapshot = { captured_on: string; captured_at: string; status: 'available' | 'unsupported' | 'unavailable'; slots: ActivitySlot[]; error_code?: string | null };
export type TimingCell = { weekday: number; hour: number; score: number | null; posts: number; avgReach: number | null; engagementRate: number | null };
export function hourlySlot(iso: string) {
  const { date, time } = lisbonParts(iso);
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return { weekday, hour: Number(time.slice(0, 2)) };
}

/** Meta hourly keys are UTC; end_time is the exclusive end of the represented day. */
export function parseOnlineFollowers(response: unknown): ActivitySlot[] {
  const data = (response as { data?: Array<{ name?: string; values?: Array<{ end_time?: string; value?: Record<string, unknown> }> }> })?.data;
  const row = data?.find(r => r.name === 'online_followers');
  const out: ActivitySlot[] = [];
  for (const sample of row?.values ?? []) {
    if (!sample.end_time || !Number.isFinite(Date.parse(sample.end_time))) continue;
    const date = new Date(Date.parse(sample.end_time) - 86400000).toISOString().slice(0, 10);
    for (const [key, value] of Object.entries(sample.value ?? {})) {
      const hour = Number(key);
      if (!/^\d{1,2}$/.test(key) || hour < 0 || hour > 23 || typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
      out.push({ ...hourlySlot(`${date}T${String(hour).padStart(2, '0')}:00:00Z`), value });
    }
  }
  return out;
}

export function bestTimes(rows: PostRow[], snapshots: ActivitySnapshot[], format: TimingFormat, now = new Date()) {
  const cutoff = now.getTime() - 90 * 86400000;
  const posts = latestPerMedia(rows).filter(p => p.posted_at && Date.parse(p.posted_at) >= cutoff && Date.parse(p.posted_at) <= now.getTime()
    && (format === 'story' ? p.media_product_type === 'STORY' : p.media_product_type !== 'STORY' && p.media_product_type !== 'REELS' && p.media_type !== 'VIDEO')
    && Number.isFinite(p.metrics.reach) && p.metrics.reach > 0);
  // Rolling provider windows overlap: use the latest snapshot only, not repeated daily copies of the same samples.
  const latestActivity = [...snapshots].sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0];
  const activity = latestActivity?.status === 'available' && Date.parse(latestActivity.captured_at) >= now.getTime() - 7 * 86400000 ? latestActivity.slots : [];
  const meanReach = posts.reduce((a, p) => a + p.metrics.reach, 0) / (posts.length || 1);
  const meanRate = posts.reduce((a, p) => a + (engagementRate(p.metrics) ?? 0), 0) / (posts.length || 1);
  const peak = Math.max(0, ...activity.map(a => a.value));
  const cells: TimingCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) for (const hour of POSTING_HOURS) {
    const list = posts.filter(p => { const s = hourlySlot(p.posted_at ?? ''); return s.weekday === weekday && s.hour === hour; });
    const avgReach = list.length ? list.reduce((a, p) => a + p.metrics.reach, 0) / list.length : null;
    const rate = list.length ? list.reduce((a, p) => a + (engagementRate(p.metrics) ?? 0), 0) / list.length : null;
    const active = activity.filter(a => a.weekday === weekday && a.hour === hour);
    const followerScore = active.length && peak > 0 ? 100 * active.reduce((a, s) => a + s.value, 0) / active.length / peak : null;
    const performance = avgReach == null ? 50 : Math.max(0, Math.min(100, 50 * (0.7 * avgReach / meanReach + 0.3 * (meanRate ? (rate ?? 0) / meanRate : 1))));
    const weight = list.length / (list.length + 6) * Math.min(1, posts.length / 20);
    const base = followerScore ?? 50;
    const score = posts.length >= MIN_POSTS ? Math.round(base * (1 - weight) + performance * weight) : followerScore == null ? null : Math.round(followerScore);
    cells.push({ weekday, hour, score, posts: list.length, avgReach, engagementRate: rate });
  }
  return { cells, postCount: posts.length, hasFollowers: activity.length > 0 && peak > 0, enoughPosts: posts.length >= MIN_POSTS, activityStatus: latestActivity?.status ?? null };
}
export type TimingMap = ReturnType<typeof bestTimes>;
export function bestSlots(map: TimingMap, weekday?: number, count = 3) {
  return map.cells.filter(c => c.score != null && (weekday == null || c.weekday === weekday)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.weekday - b.weekday || a.hour - b.hour).slice(0, count);
}
export function timingTone(score: number | null) { return score == null ? '' : score >= 65 ? 'timing-best' : score <= 35 ? 'timing-weak' : 'timing-average'; }