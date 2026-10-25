import { ClearanceSources } from '@/components/marketing/clearance-sources';
import { canRecheckClearance } from '@/lib/marketing/clearance';
import { languageChip, type PostLanguage } from "@/lib/marketing/post-language";
import { PipelineStrip, StepHint } from "@/components/marketing/pipeline-strip";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState , useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical, ImageOff, Instagram, Layers, Linkedin, X } from "lucide-react";
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
import type { StoryManifest } from "@/lib/marketing/story-render";
import { PREVIEW, PREVIEW_VERSION, resolveDraftImages, signPaths } from "@/lib/marketing/draft-images";
import { gridOrder, lisbonParts, lisbonToUtcIso, lowWeeks, mondayOf, repetitionWarnings, WEEKLY_TARGET, type CalendarPost } from "@/lib/marketing/calendar";
import { InstagramGrid, type GridPost } from "@/components/marketing/instagram-grid";
import { InstagramPublishControls } from "@/components/marketing/instagram-publish-controls";
import { instagramFeed, scheduleInstagram } from "@/lib/marketing/instagram.functions";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from '@/hooks/use-auth';
import { Switch } from '@/components/ui/switch';
import { useBestTimes } from '@/lib/marketing/use-best-times';
import { bestSlots, hourlySlot, POSTING_HOURS, timingTone, type TimingFormat } from '@/lib/marketing/best-times';
import { TimingLegend, TimingFormatChoice, useTimingLabel } from '@/components/marketing/best-times-map';

export const Route = createFileRoute("/_app/marketing/calendar")({
  validateSearch: (s: Record<string, unknown>): { highlight?: string } =>
    typeof s.highlight === "string" && /^[0-9a-f-]{36}$/i.test(s.highlight) ? { highlight: s.highlight } : {},
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="all">
      <CalendarPage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Calendar — Portal Pedra Silva" },
      { name: "description", content: "Week and month editorial calendar with an Instagram grid preview for Pedra Silva Arquitectos." },
      { property: "og:title", content: "Calendar — Portal Pedra Silva" },
      { property: "og:description", content: "Week and month editorial calendar with an Instagram grid preview for Pedra Silva Arquitectos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  post_language: PostLanguage; story_render_manifest: StoryManifest | null;
  safety_flags: string[];
  id: string; request_id: string; platform: "instagram" | "linkedin"; status: string; scheduled_at: string | null; created_at: string;
  pillar: string | null; persona: string | null; project_id: string | null; asset_ids: string[];
  final_copy: string | null; ai_copy: string; final_hashtags: string[] | null; ai_hashtags: string[]; format: string | null; published_url: string | null; publish_error_message: string | null; publish_sent_at: string | null;
};

function useCalendarData() {
  return useQuery({
    queryKey: ["marketing-calendar", PREVIEW_VERSION, PREVIEW.tile],
    refetchInterval: 30000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb.from("marketing_post_drafts")
        .select("id, request_id, platform, status, scheduled_at, created_at, pillar, persona, project_id, asset_ids, final_copy, ai_copy, final_hashtags, ai_hashtags, format, published_url, publish_error_message, publish_sent_at, story_render_manifest, post_language, safety_flags")
        .in("status", ["approved", "scheduled", "publishing", "published", "failed"]).order("created_at", { ascending: false }).limit(400);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const pids = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
      // Whole-image 400px previews keep narrow weekly tiles crisp at retina density.
      // Month cells reuse the same cached previews at compact portrait dimensions.
      const [thumbs, images, { data: projects }] = await Promise.all([
        resolveDraftImages(sb, [...new Set(rows.map((r) => r.asset_ids[0]).filter(Boolean))], 3600, { preview: PREVIEW.tile }),
        resolveDraftImages(sb, [...new Set(rows.filter((r) => r.platform === "instagram").flatMap((r) => r.asset_ids))], 3600, { preview: PREVIEW.tile }),
        pids.length ? sb.from("pm_projects").select("id, name").in("id", pids) : { data: [] },
      ]);
      const storyUrls = await signPaths(sb, rows.flatMap(r => (r.story_render_manifest?.paths ?? []).map(path => ({ path }))), 3600, PREVIEW.tile);
      const urls = new Map(images.map((i) => [i.id, i.url]));
      const thumbUrls = new Map(thumbs.map((i) => [i.id, { url: i.url, video: i.mime_type?.startsWith("video/") }]));
      const names: Record<string, string> = {};
      for (const p of projects ?? []) names[p.id] = p.name;
      return { rows, urls, thumbUrls, names, storyUrls };
    },
  });
}

const caption = (r: Row) => r.final_copy ?? r.ai_copy;
const firstLine = (r: Row) => caption(r).split("\n").find((l) => l.trim())?.trim() ?? "";

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
  const [dragKind, setDragKind] = useState<TimingFormat | null>(null);
  const [timingKind, setTimingKind] = useState<TimingFormat>('feed');
  const [showTimes, setShowTimes] = useState(true);
  const { user } = useAuth();
  const preferenceKey = user ? `psa.marketing.bestTimes.${user.id}` : null;
  useEffect(() => { if (preferenceKey) { try { setShowTimes(localStorage.getItem(preferenceKey) !== 'off'); } catch { /* preference storage may be disabled */ } } }, [preferenceKey]);
  const timing = useBestTimes(dragKind ?? timingKind); const timingLabel = useTimingLabel();
  const topSlots = bestSlots(timing.map);
  const timingCell = (date: string, hour: number) => timing.map.cells.find(c => c.weekday === hourlySlot(`${date}T12:00:00Z`).weekday && c.hour === hour);
  const bestHour = (date: string, kind: TimingFormat) => bestSlots(bestTimesFor(kind), hourlySlot(`${date}T12:00:00Z`).weekday, 1)[0]?.hour;
  const bestTimesFor = (kind: TimingFormat) => bestTimes(timing.data?.posts ?? [], timing.data?.activity ?? [], kind);
  const [previewRow, setPreviewRow] = useState<Row | null>(null);
  const previewImgs = useQuery({
    queryKey: ["marketing-calendar-preview", PREVIEW_VERSION, previewRow?.id],
    enabled: !!previewRow,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const paths = previewRow?.story_render_manifest?.paths;
      if (paths?.length) { const urls = await signPaths(supabase, paths.map(path=>({path})), 3600, PREVIEW.tile); return paths.map((path,i)=>({id:path, url:urls.get(path), file_name:`Story ${i+1}`, mime_type:"image/jpeg"})); }
      return resolveDraftImages(supabase, previewRow?.asset_ids ?? [], 3600, { preview: PREVIEW.tile });
    },
  });

  const days = useMemo(() => {
    const start = view === "week" ? startOfWeek(anchor, { weekStartsOn: 1 }) : startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const end = view === "week" ? endOfWeek(anchor, { weekStartsOn: 1 }) : endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
  }, [view, anchor]);

  const rows = data?.rows ?? [];
  const { highlight } = Route.useSearch();
  const highlighted = useRef(false);
  const rechecked = useRef(new Set<string>());
  useEffect(() => {
    const ids = rows.filter(r => canRecheckClearance(r.status) && !rechecked.current.has(r.id)).map(r => r.id);
    if (!canCurate || !ids.length) return;
    ids.forEach(id => rechecked.current.add(id));
    supabase.rpc('marketing_recheck_drafts', { _ids: ids }).then(({ error }) => {
      if (error) { ids.forEach(id => rechecked.current.delete(id)); return; }
      qc.invalidateQueries({ queryKey: ['marketing-calendar'] });
      qc.invalidateQueries({ queryKey: ['marketing-clearance-sources'] });
    });
  }, [rows, canCurate, qc]);
  useEffect(() => {
    const row = highlight ? rows.find((x) => x.id === highlight) : undefined;
    if (!row || highlighted.current) return;
    highlighted.current = true;
    if (row.scheduled_at) setAnchor(new Date(row.scheduled_at));
    setTimeout(() => document.querySelector(`[data-post-id="${row.id}"]`)?.scrollIntoView({ block: "center" }), 300);
  }, [highlight, rows]);
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
    const hour = bestHour(date, row.format === 'story' ? 'story' : 'feed');
    setDragKind(null);
    setDrop({ row, date, time: hour == null ? (row.scheduled_at ? lisbonParts(row.scheduled_at).time : "10:00") : `${String(hour).padStart(2,'0')}:00` });
  };

  const gridPosts: GridPost[] = gridOrder(rows.filter((r) => r.platform === "instagram" && ["approved","scheduled","publishing","published","failed"].includes(r.status))).map((r) => ({
    id: r.id, caption: caption(r), hashtags: r.final_hashtags ?? r.ai_hashtags,
    images: r.story_render_manifest?.paths.length ? r.story_render_manifest.paths.map(p=>data?.storyUrls.get(p)).filter((u):u is string=>!!u) : r.asset_ids.map((a) => data?.urls.get(a)).filter((u): u is string => !!u),
    status: r.status, permalink:r.published_url,error:r.publish_error_message,sentAt:r.publish_sent_at,
    when: r.scheduled_at ? new Date(r.scheduled_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null,
  }));

  const Thumb = ({ r, size, tile = false }: { r: Row; size: string; tile?: boolean }) => {
    const path = r.story_render_manifest?.paths[0];
    const th = path ? {url:data?.storyUrls.get(path),video:false} : data?.thumbUrls.get(r.asset_ids[0]);
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded bg-muted", size)}>
        {th?.url ? (th.video
          ? <video src={th.url} muted preload="metadata" className="h-full w-full object-cover object-center" />
          : <img data-thumb={r.id} src={th.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-center" />)
          : <ImageOff className="m-auto h-full w-3 text-muted-foreground" />}
        {r.asset_ids.length > 1 && (
          <span className={cn("absolute top-1 flex items-center gap-0.5 rounded bg-background/90 px-1 py-0.5 text-[10px] font-medium", tile ? "left-1" : "right-0.5")} aria-label={t("calendar.slides", { count: r.asset_ids.length })}>
            <Layers className="h-2.5 w-2.5" />{r.asset_ids.length}
          </span>
        )}
        {tile && <span className="absolute right-1 top-1 rounded bg-background/90 p-1"><PlatformIcon r={r} /><span className="text-[10px] text-muted-foreground" data-post-language={r.post_language}>{languageChip(r.post_language)}</span></span>}
      </span>
    );
  };
  const PlatformIcon = ({ r }: { r: Row }) => r.platform === "instagram"
    ? <Instagram className="h-3 w-3 shrink-0" aria-label={t("posts.platform.instagram")} />
    : <Linkedin className="h-3 w-3 shrink-0" aria-label={t("posts.platform.linkedin")} />;

  const Item = ({ r, compact, dayTile = false }: { r: Row; compact?: boolean; dayTile?: boolean }) => {
    const movable = canCurate && ["approved","scheduled"].includes(r.status);
    return (
    <div draggable={movable} role="button" tabIndex={0} data-calendar-tile={dayTile ? r.id : undefined} data-post-id={r.id}
      data-highlight={highlight === r.id ? "true" : undefined}
      onDragStart={(e) => {
        setDragKind(r.format === 'story' ? 'story' : 'feed');
        e.dataTransfer.setData("text/plain", r.id);
        // Use the entire visible tile, including badges, time and caption.
        e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.clientWidth / 2, 24);
      }}
      onDragEnd={() => { setDragKind(null); setOverDay(null); }}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button,a")) setPreviewRow(r); }}
      onKeyDown={(e) => { if (e.key === "Enter") setPreviewRow(r); }}
      className={cn("group min-w-0 rounded border bg-card p-1 text-xs hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", highlight === r.id && "ring-2 ring-primary", dayTile && "motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5", movable ? "cursor-grab" : "cursor-pointer")}>
      {dayTile ? (
        <>
          <Thumb r={r} tile size={cn("w-full", r.format === "story" ? "aspect-[9/16]" : "aspect-[4/5]")} />
          <div className="min-w-0 px-0.5 pb-0.5 pt-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] text-muted-foreground" data-post-language={r.post_language}>{languageChip(r.post_language)}</span>
              {r.scheduled_at && <span className="font-bold tabular-nums">{lisbonParts(r.scheduled_at).time}</span>}
              {(repsBy.get(r.id) ?? []).length > 0 && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />}
              {canCurate && r.status === "scheduled" && <Button variant="ghost" size="icon" aria-label={t("calendar.unschedule")} onClick={() => void unschedule(r)} className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"><X className="h-3 w-3" /></Button>}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{firstLine(r)}</p>
            {r.status !== "scheduled" && <span className={cn("text-[10px]", r.status === "failed" ? "text-destructive" : "text-muted-foreground")}>{t(`posts.status.${r.status}`)}</span>}
            {r.platform === "instagram" && ["failed", "published"].includes(r.status) && <InstagramPublishControls draftId={r.id} status={r.status} canCurate={canCurate} error={r.publish_error_message} permalink={r.published_url} sentAt={r.publish_sent_at} />}
          </div>
        </>
      ) : compact ? (
        <div className="flex items-center gap-1">
          <Thumb r={r} size="h-10 w-8" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <PlatformIcon r={r} /><span className="text-[10px] text-muted-foreground" data-post-language={r.post_language}>{languageChip(r.post_language)}</span>
              {r.scheduled_at && <span className="font-medium">{lisbonParts(r.scheduled_at).time}</span>}
            </div>
            {r.status !== "scheduled" && <span className={cn("text-[10px]", r.status === "failed" ? "text-destructive" : "text-muted-foreground")}>{t(`posts.status.${r.status}`)}</span>}
          </div>
          {(repsBy.get(r.id) ?? []).length > 0 && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />}
        </div>
      ) : (
      <div className="flex items-start gap-1.5">
        {movable && <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
        <Thumb r={r} size="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <PlatformIcon r={r} /><span className="text-[10px] text-muted-foreground" data-post-language={r.post_language}>{languageChip(r.post_language)}</span>
            {r.scheduled_at && <span className="font-medium">{lisbonParts(r.scheduled_at).time}</span>}
            <Badge variant={r.status==="failed"?"destructive":"secondary"} className="px-1 py-0 text-[10px]">{t(`posts.status.${r.status}`)}</Badge>
          </div>
          <p className="mt-0.5 truncate">{firstLine(r)}</p>
          {r.platform==="instagram"&&["failed","published"].includes(r.status)&&<InstagramPublishControls draftId={r.id} status={r.status} canCurate={canCurate} error={r.publish_error_message} permalink={r.published_url} sentAt={r.publish_sent_at}/>}
          {(r.pillar || r.project_id) && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{[r.pillar, r.persona, r.project_id ? data?.names[r.project_id] : null].filter(Boolean).join(" · ")}</p>}
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
      )}
    </div>
    );
  };

  const title = view === "week"
    ? `${format(parseISO(days[0]), "d MMM", { locale })} – ${format(parseISO(days[days.length - 1]), "d MMM yyyy", { locale })}`
    : format(anchor, "LLLL yyyy", { locale });
  const move = (n: number) => setAnchor((a) => (view === "week" ? addDays(a, 7 * n) : addMonths(a, n)));
  const month = format(anchor, "yyyy-MM");

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("calendar.title")}</h1>
        <StepHint step="calendar" />
      </div>
      <ModuleSubnav moduleId="marketing" />
      <PipelineStrip current="calendar" />
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2"><Switch id="show-best-times" checked={showTimes} onCheckedChange={value => { setShowTimes(value); if (preferenceKey) { try { localStorage.setItem(preferenceKey, value ? 'on' : 'off'); } catch { /* optional preference */ } } }} /><Label htmlFor="show-best-times">{t('bestTimes.show')}</Label></div>
            {showTimes && <TimingFormatChoice value={timingKind} onChange={setTimingKind} />}
          </div>
          {showTimes && (timing.isError ? <p className="text-xs text-destructive">{t('bestTimes.loadError')}</p> : <TimingLegend map={timing.map} />)}
          {low.length > 0 && (
            <div className="space-y-1 border-l-2 border-warning bg-muted p-2 text-xs">
              {low.map((w) => <p key={w.week} className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" />
                {t("calendar.warn.lowWeek", { week: format(parseISO(w.week), "d MMM", { locale }), count: w.count, target: WEEKLY_TARGET })}</p>)}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-[16rem_1fr]">
            <Card className="min-w-0 space-y-2 overflow-x-auto p-3">
              <h2 className="text-sm font-semibold">{t("calendar.approvedList")}</h2>
              <p className="text-xs text-muted-foreground">{canCurate ? t("calendar.dragHint") : t("calendar.readOnly")}</p>
              {isLoading ? <p className="text-xs">{t("common:loading")}</p> : unplaced.length === 0
                ? <p className="text-xs text-muted-foreground">{t("calendar.noApproved")}</p>
                : <div className="space-y-1.5">{unplaced.map((r) => <Item key={r.id} r={r} />)}</div>}
            </Card>
            <div className="min-w-0 overflow-x-auto"><div className={cn('grid min-w-[700px] gap-px overflow-hidden rounded border bg-border', view === 'week' && showTimes ? 'grid-cols-[3rem_repeat(7,minmax(0,1fr))]' : 'grid-cols-7')} data-calendar-week={view === 'week' ? 'true' : undefined}>
              {view === 'week' && showTimes && <div className="bg-muted" />}
              {days.slice(0, 7).map((d) => <div key={`h-${d}`} className="bg-muted px-2 py-1 text-xs font-medium capitalize">{format(parseISO(d), "EEE", { locale })}</div>)}
              {view === 'week' && showTimes && <div className="bg-background pt-6">{POSTING_HOURS.map(h=><div key={h} className="h-12 border-t border-border/40 px-1 text-[10px] tabular-nums text-muted-foreground">{String(h).padStart(2,'0')}:00</div>)}</div>}
              {days.map((d) => (
                <div key={d} onDragOver={(e) => { if (canCurate) { e.preventDefault(); setOverDay(d); } }} onDragLeave={() => setOverDay((o) => (o === d ? null : o))}
                  onDrop={(e) => { e.preventDefault(); onDrop(d, e.dataTransfer.getData("text/plain")); }}
                  data-calendar-day={d}
                  className={cn("relative min-w-0 bg-background", view === "week" ? "min-h-64" : "min-h-28 p-1 space-y-2", view === 'week' && !showTimes && 'p-1 space-y-2', overDay === d && "ring-2 ring-inset ring-primary",
                    view === 'month' && showTimes && timingTone(bestSlots(timing.map,hourlySlot(`${d}T12:00:00Z`).weekday,1)[0]?.score ?? null),
                    view === "month" && !d.startsWith(month) && "opacity-50")}>
                  <div className={cn('text-[11px] text-muted-foreground',view === 'week' && showTimes && 'h-6 px-1 pt-1')}>{format(parseISO(d), "d", { locale })}</div>
                  {view === 'week' && showTimes ? <div className="relative min-h-[816px]">
                    <div className="absolute inset-0">{POSTING_HOURS.map(h => { const cell=timingCell(d,h); const top=dragKind && topSlots.some(s=>s.weekday===cell?.weekday&&s.hour===h); return <div key={h} data-timing-hour={h} tabIndex={0} title={cell ? timingLabel(cell) : undefined} aria-label={cell ? timingLabel(cell) : undefined} className={cn('h-12 border-t border-border/40', timingTone(cell?.score ?? null), top && 'ring-2 ring-inset ring-primary')} />; })}</div>
                    <div className="pointer-events-none relative z-10 grid grid-rows-[repeat(17,48px)] px-1 pb-2">{POSTING_HOURS.map(h => <div key={h} className="col-start-1 min-w-0" style={{gridRowStart:h-6}}>{(byDay.get(d) ?? []).filter(r => Math.max(7,Math.min(23,Number(lisbonParts(r.scheduled_at ?? '').time.slice(0,2)))) === h).map(r=><div key={r.id} className="pointer-events-auto relative mb-2"><Item r={r} dayTile /></div>)}</div>)}</div>
                  </div> : (byDay.get(d) ?? []).map((r) => <Item key={r.id} r={r} compact={view === "month"} dayTile={view === "week"} />)}
                </div>
              ))}
            </div></div>
          </div>
        </TabsContent>
        <TabsContent value="grid">
          <InstagramGrid planned={gridPosts} canCurate={canCurate} loadFull={async (id) => { const r = rows.find((x) => x.id === id); if (!r) return null; const imgs = await resolveDraftImages(supabase, r.asset_ids, 900); return imgs.map((i) => i.url).filter((u): u is string => !!u); }} liveError={feed.data?.error ?? (feed.isError?"feedUnavailable":null)} live={feed.data?.posts.map(p=>({id:p.id,caption:p.caption,images:[p.thumbnail_url??p.media_url].filter((u):u is string=>!!u),permalink:p.permalink,when:p.timestamp?new Date(p.timestamp).toLocaleString():null}))} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewRow} onOpenChange={(v) => !v && setPreviewRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2">
            {previewRow && <PlatformIcon r={previewRow} />}{t("calendar.preview")}
            {previewRow && previewRow.asset_ids.length > 1 && <Badge variant="secondary">{t("calendar.slides", { count: previewRow.asset_ids.length })}</Badge>}
            {previewRow?.scheduled_at && <span className="text-sm font-normal text-muted-foreground">{new Date(previewRow.scheduled_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "medium", timeStyle: "short" })}</span>}
          </DialogTitle></DialogHeader>
          <div className="flex snap-x gap-2 overflow-x-auto">
            {previewImgs.isLoading && previewRow?.asset_ids.map((a) => <div key={a} className="h-56 w-44 shrink-0 animate-pulse rounded bg-muted" />)}
            {(previewImgs.data ?? []).map((img, i) => (
              <div key={img.id} className="relative shrink-0 snap-start">
                {img.url ? (img.mime_type?.startsWith("video/")
                  ? <video src={img.url} controls preload="metadata" className="h-56 rounded" />
                  : <img src={img.url} alt={img.file_name} loading="lazy" decoding="async" className="h-56 w-auto rounded bg-muted object-contain" />)
                  : <div className="flex h-56 w-44 items-center justify-center rounded bg-muted"><ImageOff className="h-5 w-5 text-muted-foreground" /></div>}
                {previewRow && previewRow.asset_ids.length > 1 && <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 text-xs font-medium">{i + 1}</span>}
              </div>
            ))}
          </div>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">{previewRow ? caption(previewRow) : ""}</p>
          {previewRow && <ClearanceSources draftId={previewRow.id} safetyFlags={rows.find(r => r.id === previewRow.id)?.safety_flags ?? previewRow.safety_flags} />}
          {previewRow?.story_render_manifest?.automatic === false && <p className="text-xs text-warning">{t("storyRender.blocked")}</p>}
          {previewRow && <p className="text-xs text-muted-foreground">{(previewRow.final_hashtags ?? previewRow.ai_hashtags).map((h) => `#${h}`).join(" ")}</p>}
          <DialogFooter>
            {previewRow && <Button variant="outline" size="sm" asChild><Link to="/marketing/posts" search={{ draft: previewRow.id }}>{t("calendar.openInPlanner")}</Link></Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
