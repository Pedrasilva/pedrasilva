import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { engagement, engagementRate, formatOf, groupBy, latestPerMedia, slotOf, type PostRow } from "@/lib/marketing/instagram-insights";
import { runInsightsAnalysis, syncInsightsNow } from "@/lib/marketing/instagram-insights.functions";
import { BestTimesMap } from '@/components/marketing/best-times-map';

export const Route = createFileRoute("/_app/marketing/published/insights")({
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="all">
      <InsightsPage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Instagram insights — Portal Pedra Silva" },
      { name: "description", content: "Instagram post and account performance history with saved Claude analyses for Pedra Silva Arquitectos." },
      { property: "og:title", content: "Instagram insights — Portal Pedra Silva" },
      { property: "og:description", content: "Instagram post and account performance history with saved Claude analyses for Pedra Silva Arquitectos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Analysis = { id: string; created_at: string; model: string; post_count: number; period_from: string | null; period_to: string | null; result: { working: string[]; notWorking: string[]; recommendations: string[] } };
const nf = new Intl.NumberFormat("pt-PT");
const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

function useInsights() {
  return useQuery({
    queryKey: ["marketing-insights"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [m, a, an, s] = await Promise.all([
        sb.from("marketing_ig_media_insights").select("media_id,captured_on,media_type,media_product_type,caption,permalink,thumbnail,posted_at,draft_id,metrics").order("captured_on", { ascending: true }).limit(5000),
        sb.from("marketing_ig_account_insights").select("captured_on,followers,metrics").order("captured_on", { ascending: true }).limit(800),
        sb.from("marketing_insight_analyses").select("id,created_at,model,post_count,period_from,period_to,result").order("created_at", { ascending: false }).limit(30),
        sb.from("marketing_settings").select("instagram_insights_synced_at,instagram_insights_error").eq("id", true).maybeSingle(),
      ]);
      const rows = (m.data ?? []) as PostRow[];
      const draftIds = [...new Set(rows.map((r) => r.draft_id).filter(Boolean))] as string[];
      const d = draftIds.length ? await sb.from("marketing_post_drafts").select("id,project_id,pillar").in("id", draftIds) : { data: [] };
      const pids = [...new Set((d.data ?? []).map((x: any) => x.project_id).filter(Boolean))] as string[];
      const p = pids.length ? await sb.from("marketing_project_directory").select("id,name").in("id", pids) : { data: [] };
      const pname = new Map((p.data ?? []).map((x: any) => [x.id, x.name as string]));
      const meta = new Map<string, { project: string; pillar: string }>((d.data ?? []).map((x: any) => [x.id, { project: x.project_id ? pname.get(x.project_id) ?? "—" : "—", pillar: x.pillar ?? "—" }]));
      return { rows, account: a.data ?? [], analyses: (an.data ?? []) as Analysis[], settings: s.data, meta };
    },
  });
}

function GroupTable({ title, groups }: { title: string; groups: ReturnType<typeof groupBy> }) {
  const { t } = useTranslation("marketing");
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground"><tr><th className="text-left">&nbsp;</th><th className="text-right">{t("insights.posts")}</th><th className="text-right">{t("insights.avgReach")}</th><th className="text-right">{t("insights.engRate")}</th></tr></thead>
        <tbody>{groups.map((g) => (
          <tr key={g.key} className="border-t"><td className="py-1">{t(`insights.key.${g.key}`, { defaultValue: g.key })}</td><td className="text-right">{g.posts}</td><td className="text-right">{nf.format(g.avgReach)}</td><td className="text-right">{pct(g.avgEngagementRate)}</td></tr>
        ))}</tbody>
      </table>
    </Card>
  );
}

function InsightsPage() {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const { data, isLoading } = useInsights();
  const sync = useServerFn(syncInsightsNow);
  const analyse = useServerFn(runInsightsAnalysis);
  const [busy, setBusy] = useState<"sync" | "ai" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const latest = useMemo(() => latestPerMedia(data?.rows ?? []), [data]);
  const metaOf = (p: PostRow) => (p.draft_id ? data?.meta.get(p.draft_id) : undefined) ?? { project: "—", pillar: "—" };
  const reachSeries = useMemo(() => {
    const byDay = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of data?.rows ?? []) byDay.set(r.captured_on, (byDay.get(r.captured_on) ?? 0) + (r.metrics.reach ?? 0));
    const acc = new Map<string, any>((data?.account ?? []).map((a: any) => [a.captured_on as string, a]));
    return [...new Set<string>([...byDay.keys(), ...(acc.keys() as IterableIterator<string>)])].sort().map((d) => ({ day: d.slice(5), postsReach: byDay.get(d) ?? null, followers: (acc.get(d) as any)?.followers ?? null, accountReach: (acc.get(d) as any)?.metrics?.reach ?? null }));
  }, [data]);

  const doSync = async () => {
    setBusy("sync");
    try { const r = await sync(); if (r.error) toast.warning(t(`insights.${r.error}`)); else toast.success(t("insights.synced", { count: r.posts })); }
    catch { toast.error(t("insights.syncFailed")); }
    finally { setBusy(null); qc.invalidateQueries({ queryKey: ["marketing-insights"] }); }
  };
  const doAnalyse = async () => {
    setBusy("ai");
    try { const r = await analyse(); if (r.error) toast.error(r.error); else { setOpenId(r.id); toast.success(t("insights.analysisSaved")); } }
    finally { setBusy(null); qc.invalidateQueries({ queryKey: ["marketing-insights"] }); }
  };
  const shown = data?.analyses.find((a) => a.id === openId) ?? data?.analyses[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("insights.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("insights.lastSync", { when: data?.settings?.instagram_insights_synced_at ? new Date(data.settings.instagram_insights_synced_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—" })}{data?.settings?.instagram_insights_error ? ` · ${t(`insights.${data.settings.instagram_insights_error}`)}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={doSync} disabled={!!busy}><RefreshCw className="mr-1 h-4 w-4" />{t("insights.refresh")}</Button>
          <Button size="sm" onClick={doAnalyse} disabled={!!busy || !latest.length}><Sparkles className="mr-1 h-4 w-4" />{busy === "ai" ? t("insights.analysing") : t("insights.analyse")}</Button>
        </div>
      </div>

      <BestTimesMap />
      {isLoading ? <p className="text-sm text-muted-foreground">…</p> : !latest.length ? (
        <Card className="p-6 text-sm text-muted-foreground">{t("insights.empty")}</Card>
      ) : (
        <>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("insights.overTime")}</h3>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={reachSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" fontSize={11} /><YAxis yAxisId="l" fontSize={11} /><YAxis yAxisId="r" orientation="right" fontSize={11} />
                  <Tooltip />
                  <Line yAxisId="l" dataKey="postsReach" name={t("insights.postsReach")} stroke="hsl(var(--primary))" dot={false} connectNulls />
                  <Line yAxisId="l" dataKey="accountReach" name={t("insights.accountReach")} stroke="hsl(var(--muted-foreground))" dot={false} connectNulls />
                  <Line yAxisId="r" dataKey="followers" name={t("insights.followers")} stroke="hsl(var(--accent-foreground))" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <GroupTable title={t("insights.byFormat")} groups={groupBy(latest, (p) => formatOf(p.media_type, p.media_product_type))} />
            <GroupTable title={t("insights.byPillar")} groups={groupBy(latest, (p) => metaOf(p).pillar)} />
            <GroupTable title={t("insights.byProject")} groups={groupBy(latest, (p) => metaOf(p).project)} />
            <GroupTable title={t("insights.byDay")} groups={groupBy(latest, (p) => slotOf(p.posted_at).day)} />
            <GroupTable title={t("insights.byBand")} groups={groupBy(latest, (p) => slotOf(p.posted_at).band)} />
          </div>

          <Card className="overflow-x-auto p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("insights.perPost")}</h3>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr>
                <th className="text-left">{t("insights.post")}</th><th>{t("insights.format")}</th><th className="text-left">{t("insights.pillar")}</th>
                {["reach", "views", "likes", "comments", "saved", "shares", "profile_visits", "follows"].map((k) => <th key={k} className="text-right">{t(`insights.m.${k}`)}</th>)}
                <th className="text-right">{t("insights.engRate")}</th>
              </tr></thead>
              <tbody>{latest.map((p) => (
                <tr key={p.media_id} className="border-t align-middle">
                  <td className="py-1"><div className="flex items-center gap-2">
                    {p.thumbnail ? <img src={p.thumbnail} alt="" className="h-9 w-7 rounded object-cover" loading="lazy" /> : <div className="h-9 w-7 rounded bg-muted" />}
                    <div className="max-w-[260px]"><div className="truncate">{p.caption ?? "—"}</div><div className="text-muted-foreground">{day(p.posted_at)}{p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="ml-1 inline-flex"><ExternalLink className="h-3 w-3" /></a>}</div></div>
                  </div></td>
                  <td className="text-center"><Badge variant="outline">{t(`insights.key.${formatOf(p.media_type, p.media_product_type)}`)}</Badge></td>
                  <td>{metaOf(p).pillar}</td>
                  {["reach", "views", "likes", "comments", "saved", "shares", "profile_visits", "follows"].map((k) => <td key={k} className="text-right">{p.metrics[k] == null ? "—" : nf.format(p.metrics[k])}</td>)}
                  <td className="text-right" title={String(engagement(p.metrics))}>{pct(engagementRate(p.metrics))}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </>
      )}

      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{t("insights.analyses")}</h3>
          {data?.analyses.map((a) => (
            <Button key={a.id} size="sm" variant={a.id === shown?.id ? "default" : "outline"} onClick={() => setOpenId(a.id)}>{new Date(a.created_at).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" })}</Button>
          ))}
        </div>
        {!shown ? <p className="text-xs text-muted-foreground">{t("insights.noAnalyses")}</p> : (
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            {(["working", "notWorking", "recommendations"] as const).map((k) => (
              <div key={k}><h4 className="mb-1 font-medium">{t(`insights.${k}`)}</h4><ul className="list-disc space-y-1 pl-4">{shown.result[k].map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            ))}
            <p className="md:col-span-3 text-xs text-muted-foreground">{t("insights.analysisMeta", { count: shown.post_count, from: shown.period_from ?? "—", to: shown.period_to ?? "—" })} · {t("insights.notAutomatic")}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
