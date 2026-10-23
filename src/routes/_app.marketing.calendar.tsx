import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical, X } from "lucide-react";
import { toast } from "sonner";
import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { V2PermissionGate } from "@/components/PermissionGate";
import { useCan } from "@/hooks/use-permissions-v2";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDateLocale } from "@/i18n/use-date-locale";
import { PREVIEW, resolveDraftImages } from "@/lib/marketing/draft-images";
import { gridOrder, lisbonParts, lisbonToUtcIso, lowWeeks, mondayOf, repetitionWarnings, WEEKLY_TARGET, type CalendarPost } from "@/lib/marketing/calendar";
import { InstagramGrid, type GridPost } from "@/components/marketing/instagram-grid";
import { InstagramPublishControls } from "@/components/marketing/instagram-publish-controls";
import { instagramFeed, scheduleInstagram } from "@/lib/marketing/instagram.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_app/marketing/calendar")({
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="all">
      <CalendarPage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Editorial calendar — Portal Pedra Silva" },
      { name: "description", content: "Week and month editorial calendar with an Instagram grid preview for Pedra Silva Arquitectos." },
      { property: "og:title", content: "Editorial calendar — Portal Pedra Silva" },
      { property: "og:description", content: "Week and month editorial calendar with an Instagram grid preview for Pedra Silva Arquitectos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  id: string; request_id: string; platform: "instagram" | "linkedin"; status: string; scheduled_at: string | null; created_at: string;
  pillar: string | null; persona: string | null; project_id: string | null; asset_ids: string[];
  final_copy: string | null; ai_copy: string; final_hashtags: string[] | null; ai_hashtags: string[]; format: string | null; published_url: string | null; publish_error_message: string | null; publish_sent_at: string | null;
};

function useCalendarData() {
  return useQuery({
    queryKey: ["marketing-calendar"],
    refetchInterval: 30000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb.from("marketing_post_drafts")
        .select("id, request_id, platform, status, scheduled_at, created_at, pillar, persona, project_id, asset_ids, final_copy, ai_copy, final_hashtags, ai_hashtags, format, published_url, publish_error_message, publish_sent_at")
        .in("status", ["approved", "scheduled", "publishing", "published", "failed"]).order("created_at", { ascending: false }).limit(400);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const pids = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
      const [images, { data: projects }] = await Promise.all([
        resolveDraftImages(sb, [...new Set(rows.flatMap((r) => r.asset_ids))], 3600, { preview: PREVIEW.tile }),
        pids.length ? sb.from("pm_projects").select("id, name").in("id", pids) : { data: [] },
      ]);
      const urls = new Map(images.map((i) => [i.id, i.url]));
      const names: Record<string, string> = {};
      for (const p of projects ?? []) names[p.id] = p.name;
      return { rows, urls, names };
    },
  });
}

const caption = (r: Row) => r.final_copy ?? r.ai_copy;

function CalendarPage() {
  const { t } = useTranslation("marketing");
  const locale = useDateLocale();
  const qc = useQueryClient();
  const { allowed: canCurate } = useCan("marketing.curate", "all");
  const { data, isLoading } = useCalendarData();
  const feedFn=useServerFn(instagramFeed);
  const scheduleFn=useServerFn(scheduleInstagram);
  const feed=useQuery({queryKey:["instagram-feed"],queryFn:()=>feedFn(),staleTime:900000});
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [drop, setDrop] = useState<{ row: Row; date: string; time: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [overDay, setOverDay] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = view === "week" ? startOfWeek(anchor, { weekStartsOn: 1 }) : startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const end = view === "week" ? endOfWeek(anchor, { weekStartsOn: 1 }) : endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
  }, [view, anchor]);

  const rows = data?.rows ?? [];
  const placed = rows.filter((r) => r.scheduled_at && ["scheduled","publishing","published","failed"].includes(r.status));
  const unplaced = rows.filter((r) => r.status === "approved");
  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of placed) { const d = lisbonParts(r.scheduled_at!).date; m.set(d, [...(m.get(d) ?? []), r]); }
    for (const list of m.values()) list.sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
    return m;
  }, [placed]);

  const calPosts: CalendarPost[] = placed.map((r) => ({ id: r.id, at: r.scheduled_at!, pillar: r.pillar, persona: r.persona, projectId: r.project_id }));
  const weeks = [...new Set(days.map(mondayOf))];
  const low = lowWeeks(calPosts, weeks);
  const reps = repetitionWarnings(calPosts);
  const repsBy = new Map<string, typeof reps>();
  for (const w of reps) repsBy.set(w.postId, [...(repsBy.get(w.postId) ?? []), w]);
  const repValue = (w: (typeof reps)[number]) => (w.field === "project" ? data?.names[w.value] ?? "—" : w.value);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["marketing-calendar"] }); qc.invalidateQueries({ queryKey: ["marketing-posts"] }); };
  const save = async () => {
    if (!drop) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let error: Error | null=null;
    try { if(drop.row.platform === "instagram")await scheduleFn({data:{draftId:drop.row.id,at:lisbonToUtcIso(drop.date,drop.time),now:false}});
    else { const r=await supabase.from("marketing_post_drafts").update({scheduled_at:lisbonToUtcIso(drop.date,drop.time),status:"scheduled"}).eq("id",drop.row.id);if(r.error)throw r.error; } } catch(e){error=e instanceof Error?e:new Error(t("posts.error"));}
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("calendar.scheduledToast"));
    setDrop(null); refresh();
  };
  const unschedule = async (r: Row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("marketing_post_drafts").update({ status: "approved", scheduled_at: null }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };
  const onDrop = (date: string, id: string) => {
    setOverDay(null);
    const row = rows.find((r) => r.id === id);
    if (!row || !canCurate || !["approved","scheduled"].includes(row.status)) return;
    setDrop({ row, date, time: row.scheduled_at ? lisbonParts(row.scheduled_at).time : "10:00" });
  };

  const gridPosts: GridPost[] = gridOrder(rows.filter((r) => r.platform === "instagram" && ["approved","scheduled","publishing","published","failed"].includes(r.status))).map((r) => ({
    id: r.id, caption: caption(r), hashtags: r.final_hashtags ?? r.ai_hashtags,
    images: r.asset_ids.map((a) => data?.urls.get(a)).filter((u): u is string => !!u),
    status: r.status, permalink:r.published_url,error:r.publish_error_message,sentAt:r.publish_sent_at,
    when: r.scheduled_at ? new Date(r.scheduled_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null,
  }));

  const Item = ({ r, compact }: { r: Row; compact?: boolean }) => (
    <div draggable={canCurate && ["approved","scheduled"].includes(r.status)} onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
      className={cn("group rounded border bg-card p-1.5 text-xs", canCurate && ["approved","scheduled"].includes(r.status) && "cursor-grab")}>
      <div className="flex items-start gap-1">
        {canCurate && ["approved","scheduled"].includes(r.status) && <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            {r.scheduled_at && <span className="font-medium">{lisbonParts(r.scheduled_at).time}</span>}
            <Badge variant="outline" className="px-1 py-0 text-[10px]">{t(`posts.platform.${r.platform}`)}</Badge>
            <Badge variant={r.status==="failed"?"destructive":"secondary"} className="px-1 py-0 text-[10px]">{t(`posts.status.${r.status}`)}</Badge>
          </div>
          <Link to="/marketing/posts" search={{ draft: r.id }} className={cn("mt-0.5 block hover:underline", compact ? "line-clamp-2" : "line-clamp-3")}>{caption(r)}</Link>
          {r.platform==="instagram"&&["failed","published"].includes(r.status)&&<InstagramPublishControls draftId={r.id} status={r.status} canCurate={canCurate} error={r.publish_error_message} permalink={r.published_url} sentAt={r.publish_sent_at}/>}
          {(r.pillar || r.project_id) && !compact && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{[r.pillar, r.persona, r.project_id ? data?.names[r.project_id] : null].filter(Boolean).join(" · ")}</p>}
          {(repsBy.get(r.id) ?? []).map((w, i) => (
            <p key={i} className="mt-0.5 flex items-start gap-1 text-[10px] text-warning">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />{t(`calendar.warn.${w.kind}`, { field: t(`calendar.field.${w.field}`), value: repValue(w) })}
            </p>
          ))}
        </div>
        {canCurate && r.status === "scheduled" && (
          <button type="button" aria-label={t("calendar.unschedule")} onClick={() => void unschedule(r)} className="opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
        )}
      </div>
    </div>
  );

  const title = view === "week"
    ? `${format(parseISO(days[0]), "d MMM", { locale })} – ${format(parseISO(days[days.length - 1]), "d MMM yyyy", { locale })}`
    : format(anchor, "LLLL yyyy", { locale });
  const move = (n: number) => setAnchor((a) => (view === "week" ? addDays(a, 7 * n) : addMonths(a, n)));
  const month = format(anchor, "yyyy-MM");

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">{t("calendar.title")}</h1>
      <ModuleSubnav moduleId="marketing" />
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">{t("calendar.tab")}</TabsTrigger>
          <TabsTrigger value="grid">{t("calendar.grid.tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon" variant="outline" aria-label={t("calendar.prev")} onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>{t("calendar.today")}</Button>
            <Button size="icon" variant="outline" aria-label={t("calendar.next")} onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
            <span className="min-w-40 font-medium capitalize">{title}</span>
            <div className="ml-auto flex gap-1">
              {(["week", "month"] as const).map((v) => <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>{t(`calendar.view.${v}`)}</Button>)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("calendar.tzHint")}</p>
          {low.length > 0 && (
            <div className="space-y-1 border-l-2 border-warning bg-muted p-2 text-xs">
              {low.map((w) => <p key={w.week} className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" />
                {t("calendar.warn.lowWeek", { week: format(parseISO(w.week), "d MMM", { locale }), count: w.count, target: WEEKLY_TARGET })}</p>)}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-[16rem_1fr]">
            <Card className="space-y-2 p-3">
              <h2 className="text-sm font-semibold">{t("calendar.approvedList")}</h2>
              <p className="text-xs text-muted-foreground">{canCurate ? t("calendar.dragHint") : t("calendar.readOnly")}</p>
              {isLoading ? <p className="text-xs">{t("common:loading")}</p> : unplaced.length === 0
                ? <p className="text-xs text-muted-foreground">{t("calendar.noApproved")}</p>
                : <div className="space-y-1.5">{unplaced.map((r) => <Item key={r.id} r={r} />)}</div>}
            </Card>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded border bg-border">
              {days.slice(0, 7).map((d) => <div key={`h-${d}`} className="bg-muted px-2 py-1 text-xs font-medium capitalize">{format(parseISO(d), "EEE", { locale })}</div>)}
              {days.map((d) => (
                <div key={d} onDragOver={(e) => { if (canCurate) { e.preventDefault(); setOverDay(d); } }} onDragLeave={() => setOverDay((o) => (o === d ? null : o))}
                  onDrop={(e) => { e.preventDefault(); onDrop(d, e.dataTransfer.getData("text/plain")); }}
                  className={cn("space-y-1 bg-background p-1", view === "week" ? "min-h-64" : "min-h-28", overDay === d && "bg-accent",
                    view === "month" && !d.startsWith(month) && "opacity-50")}>
                  <div className="text-[11px] text-muted-foreground">{format(parseISO(d), "d", { locale })}</div>
                  {(byDay.get(d) ?? []).map((r) => <Item key={r.id} r={r} compact={view === "month"} />)}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="grid">
          <InstagramGrid planned={gridPosts} canCurate={canCurate} liveError={feed.data?.error ?? (feed.isError?"feedUnavailable":null)} live={feed.data?.posts.map(p=>({id:p.id,caption:p.caption,images:[p.thumbnail_url??p.media_url].filter((u):u is string=>!!u),permalink:p.permalink,when:p.timestamp?new Date(p.timestamp).toLocaleString():null}))} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!drop} onOpenChange={(v) => !busy && !v && setDrop(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("calendar.setTime")}</DialogTitle></DialogHeader>
          <p className="line-clamp-3 text-sm text-muted-foreground">{drop ? caption(drop.row) : ""}</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("calendar.date")}</Label><Input type="date" value={drop?.date ?? ""} onChange={(e) => setDrop((x) => (x ? { ...x, date: e.target.value } : x))} /></div>
            <div><Label>{t("calendar.time")}</Label><Input type="time" value={drop?.time ?? ""} onChange={(e) => setDrop((x) => (x ? { ...x, time: e.target.value } : x))} /></div>
          </div>
          <p className="text-xs text-muted-foreground">{t("calendar.tzHint")}</p>
          <DialogFooter className="gap-2">
            <Button onClick={save} disabled={busy || !drop?.date || !drop?.time}>{t("calendar.schedulePublish")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
