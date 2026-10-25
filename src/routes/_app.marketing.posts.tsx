import { canRecheckClearance } from '@/lib/marketing/clearance';
import { approvalActions } from '@/lib/marketing/approval-state';
import { useDraftApprovalState } from '@/lib/marketing/use-draft-approval-state';
import { ClearanceSources } from '@/components/marketing/clearance-sources';
import { POST_LANGUAGES, languageChip, type PostLanguage, type RunLanguage } from "@/lib/marketing/post-language";
import { translatePost } from "@/lib/marketing/translate-post.functions";
import { prepareStoryRender } from "@/lib/marketing/render-story-browser";
import { getStoryRenderContext } from "@/lib/marketing/story-render.functions";
import type { StoryManifest } from "@/lib/marketing/story-render";
import { PipelineStrip, StepHint } from "@/components/marketing/pipeline-strip";
import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Check, Copy, Download, Loader2, RefreshCw, Save, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { V2PermissionGate } from "@/components/PermissionGate";
import { useCan } from "@/hooks/use-permissions-v2";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useActiveBible } from "@/lib/marketing/bible";
import { generatePostSuggestions } from "@/lib/marketing/posts.functions";
import { NewCarouselButton } from "@/components/marketing/carousels-card";
import { PREVIEW, PREVIEW_VERSION, resolveDraftImages, signPaths } from "@/lib/marketing/draft-images";
import { InstagramPublishControls } from "@/components/marketing/instagram-publish-controls";
import { PostApprovalControls } from "@/components/marketing/post-approval-controls";
import { PlannerGrid } from "@/components/marketing/planner-grid";
import { useDraftWarningConfirm } from "@/components/marketing/draft-warning-confirm";
import { asPlannerTab, inTab, PLANNER_VISIBLE_TABS, tabCounts, tabOf, type PlannerTab } from "@/lib/marketing/planner-tabs";

export const Route = createFileRoute("/_app/marketing/posts")({
  validateSearch: (s: Record<string, unknown>): { request?: string; draft?: string; tab?: PlannerTab } => ({
    ...(typeof s.request === "string" ? { request: s.request } : {}),
    ...(typeof s.draft === "string" && /^[0-9a-f-]{36}$/i.test(s.draft) ? { draft: s.draft } : {}),
    ...(typeof s.tab === "string" ? { tab: asPlannerTab(s.tab) } : {}),
  }),
  // Approved/scheduled/published posts now live in the Calendar and Published; keep old links working.
  beforeLoad: ({ search }) => {
    const highlight = search.draft ? { highlight: search.draft } : {};
    if (search.tab === "approved" || search.tab === "scheduled") throw redirect({ to: "/marketing/calendar", search: highlight, replace: true });
    if (search.tab === "published") throw redirect({ to: "/marketing/published", search: highlight, replace: true });
  },
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="all">
      <PostPlannerPage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Post Planner — Portal Pedra Silva" },
      { name: "description", content: "AI-drafted Instagram and LinkedIn posts built from cleared marketing material." },
      { property: "og:title", content: "Post Planner — Portal Pedra Silva" },
      { property: "og:description", content: "AI-drafted Instagram and LinkedIn posts built from cleared marketing material." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const BUCKET = "marketing-assets";
const STATUSES = ["suggested", "pending_approval", "approved", "scheduled", "publishing", "rejected", "published", "failed"] as const;
type Platform = "instagram" | "linkedin";
type Draft = {
  post_language: PostLanguage; id: string; request_id: string; idea_id: string; platform: Platform; capture_ids: string[]; asset_ids: string[];
  project_id: string | null; pillar: string | null; persona: string | null; ai_copy: string; ai_hashtags: string[];
  final_copy: string | null; final_hashtags: string[] | null; rationale: string;
  readiness: "ready" | "needs_approval" | "blocked"; readiness_note: string | null; safety_flags: string[];
  status: (typeof STATUSES)[number]; decision_note: string | null; decided_at: string | null;
  published_at: string | null; published_url: string | null; created_at: string; edited_after_approval?: boolean; brief_item?: string | null; scheduled_at?: string | null;
  story_render_manifest?: StoryManifest | null;
  publish_error_message?:string|null; publish_sent_at?:string|null; publish_lock_id?:string|null; ig_media_id?:string|null;
  format?: "single" | "carousel" | "story"; ai_story_frames?: StoryFrame[] | null; final_story_frames?: StoryFrame[] | null;
};
type StickerType = "none" | "poll" | "question" | "link";
type StoryFrame = { kind?: "image" | "text"; asset_id: string; text: string; line?: string | null; sticker: { type: StickerType; text: string }; sticker_policy?: "omit" | "manual" };
const renderFrames = (fr: StoryFrame[]) =>
  fr.map((f, i) => f.kind === "text" ? `${i + 1}. [Preview] ${f.text.trim()}${f.line?.trim() ? ` — ${f.line.trim()}` : ""}` : `${i + 1}. ${f.text.trim()}${f.sticker && f.sticker.type !== "none" ? ` [${f.sticker.type}: ${f.sticker.text.trim()}]` : ""}`).join("\n");

/** Story text preview card, in the brand's colours and display typeface (theme tokens). */
function TextFrameCard({ frame }: { frame: StoryFrame }) {
  return (
    <div className="flex h-64 w-36 flex-col justify-center gap-2 rounded border bg-background p-3 text-foreground">
      <p className="font-display text-base leading-tight">{frame.text}</p>
      {frame.line && <p className="text-[11px] leading-snug text-muted-foreground">{frame.line}</p>}
    </div>
  );
}

function DeleteButton({ label, ids, column }: { label: string; ids: string[]; column: "id" | "request_id" | "idea" }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } = column === "request_id"
      ? await db.from("marketing_post_requests").delete().in("id", ids)
      : await db.from("marketing_post_drafts").delete().in("id", ids);
    setBusy(false);
    if (error) { toast.error(error.message || t("posts.error")); return; }
    toast.success(t("posts.deleted"));
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["marketing-posts"] });
  };
  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="mr-1 h-3.5 w-3.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("posts.deleteConfirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("posts.cancel")}</Button>
            <Button variant="destructive" onClick={go} disabled={busy}>{label}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
type Req = { id: string; brief: string | null; focus_profile_id?: string | null; period_start: string; period_end: string; idea_count: number; status: string; error: string | null; created_at: string };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function nextWeek() {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return [iso(mon), iso(sun)] as const;
}

const READY_CLASS: Record<Draft["readiness"], string> = {
  ready: "bg-success/15 text-success border-success/30",
  needs_approval: "bg-warning/15 text-warning border-warning/30",
  blocked: "bg-destructive/15 text-destructive border-destructive/30",
};

function usePlannerData() {
  return useQuery({
    queryKey: ["marketing-posts"],
    refetchInterval: (q) => ((q.state.data as { requests: Req[] } | undefined)?.requests.some((r) => r.status === "running") ? 4000 : 15000),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [{ data: requests, error: e1 }, { data: drafts, error: e2 }] = await Promise.all([
        sb.from("marketing_post_requests").select("*").order("created_at", { ascending: false }).limit(30),
        sb.from("marketing_post_drafts").select("*").order("created_at", { ascending: false }).limit(400),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const ds = (drafts ?? []) as Draft[];
      const assetIds = [...new Set(ds.flatMap((d) => d.asset_ids))];
      const projectIds = [...new Set(ds.map((d) => d.project_id).filter(Boolean))] as string[];
      const [assets, { data: projects }] = await Promise.all([
        resolveDraftImages(sb, assetIds, 3600, { sign: false }),
        projectIds.length ? sb.from("pm_projects").select("id, name").in("id", projectIds) : { data: [] },
      ]);
      const assetMap: Record<string, { storage_path: string; file_name: string; mime_type: string }> = {};
      for (const a of assets) assetMap[a.id] = a;
      const projectMap: Record<string, string> = {};
      for (const p of projects ?? []) projectMap[p.id] = p.name;
      return { requests: (requests ?? []) as Req[], drafts: ds, assetMap, projectMap };
    },
  });
}

async function recheckDrafts(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.rpc('marketing_recheck_drafts', { _ids: ids });
  if (error) throw error;
}

function PostPlannerPage() {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const { request: requestParam, draft: focusDraft, tab: tabParam } = Route.useSearch();
  // A ?draft= deep link opens on the tab that contains that post.
  const generate = useServerFn(generatePostSuggestions);
  const [defStart, defEnd] = nextWeek();
  const [brief, setBrief] = useState("");
  const [start, setStart] = useState(defStart);
  const [end, setEnd] = useState(defEnd);
  const [count, setCount] = useState(5);
  const [storyCount, setStoryCount] = useState(0);
  const [runLanguage, setRunLanguage] = useState<RunLanguage>("project");
  const [focusProfile, setFocusProfile] = useState("none");
  const { data: focusOptions = [] } = useQuery({
    queryKey: ["marketing-focus-profiles"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("marketing_project_profiles").select("id, pm_projects(name)");
      if (error) throw error;
      return ((data ?? []) as { id: string; pm_projects: { name: string } | null }[])
        .map((p) => ({ id: p.id, name: p.pm_projects?.name ?? "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const focusName = (id: string | null | undefined) => (id ? focusOptions.find((o) => o.id === id)?.name ?? null : null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate({ from: "/marketing/posts" });
  const [plannerView, setPlannerView] = useState<"list" | "grid">("list");
  const { allowed: canCurate } = useCan("marketing.curate", "all");
  const { data, isLoading } = usePlannerData();
  const focusRow = focusDraft ? data?.drafts.find((d) => d.id === focusDraft) : undefined;
  const focusRequest = requestParam ?? focusRow?.request_id;
  const focusTab = focusRow ? tabOf(focusRow) : null;
  const tab: PlannerTab = tabParam ?? (focusTab === "review" || focusTab === "rejected" ? focusTab : focusRow ? "all" : "review");
  const [genOpen, setGenOpen] = useState(false);
  useEffect(() => {
    if (focusDraft && data) setTimeout(() => document.getElementById(`draft-${focusDraft}`)?.scrollIntoView({ block: "center" }), 300);
  }, [focusDraft, data]);
  const { data: bible } = useActiveBible();
  const rechecked = useRef(new Set<string>());
  useEffect(() => {
    const ids = (data?.drafts ?? []).filter((d) => canRecheckClearance(d.status) && !rechecked.current.has(d.id)).map((d) => d.id);
    if (!canCurate || !ids.length) return;
    ids.forEach((id) => rechecked.current.add(id));
    recheckDrafts(ids).then(() => qc.invalidateQueries({ queryKey: ["marketing-posts"] })).catch(() => { ids.forEach(id => rechecked.current.delete(id)); });
  }, [data, qc, canCurate]);

  const pillarName = (k: string | null) => (k ? bible?.pillars.find((p) => p.key === k)?.name ?? k : null);
  const personaName = (k: string | null) => (k ? bible?.personas.find((p) => p.key === k)?.name ?? k : null);

  const run = async () => {
    setBusy(true);
    setTimeout(() => qc.invalidateQueries({ queryKey: ["marketing-posts"] }), 1500);
    try {
      const r = await generate({ data: { language: runLanguage, brief: brief || null, periodStart: start, periodEnd: end, ideaCount: count, storyCount, focusProfileId: focusProfile === "none" ? null : focusProfile } });
      if (r.ok) toast.success(`${t("posts.generated", { count: r.ideas })}${"stories" in r && r.stories ? ` · ${t("posts.storiesGenerated", { count: r.stories })}` : ""}`);
      else toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("posts.error"));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
    }
  };

  const running = busy || data?.requests.some((r) => r.status === "running");

  const balance = useMemo(() => {
    const since = Date.now() - 30 * 864e5;
    const recent = (data?.drafts ?? []).filter((d) => (d.status === "approved" || d.status === "published") && d.decided_at && new Date(d.decided_at).getTime() >= since);
    const by = (key: "pillar" | "persona") => {
      const m: Record<string, number> = {};
      for (const d of recent) { const k = d[key] ?? "—"; m[k] = (m[k] ?? 0) + 1; }
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    return { total: recent.length, pillars: by("pillar"), personas: by("persona") };
  }, [data]);

  const ideas = useMemo(() => {
    const reqById = new Map((data?.requests ?? []).map((r) => [r.id, r]));
    const byIdea = new Map<string, Draft[]>();
    for (const d of data?.drafts ?? []) byIdea.set(d.idea_id, [...(byIdea.get(d.idea_id) ?? []), d]);
    const created = (ds: Draft[]) => reqById.get(ds[0].request_id)?.created_at ?? "";
    return [...byIdea.values()]
      .filter((ds) => ds.some((d) => inTab(d, tab)))
      .sort((a, b) => Number(b[0].request_id === focusRequest) - Number(a[0].request_id === focusRequest) || created(b).localeCompare(created(a)))
      .map((ds) => ({ drafts: ds, runAt: created(ds) || null }));
  }, [data, tab, focusRequest]);
  const runningReqs = (data?.requests ?? []).filter((r) => r.status === "running");
  const counts = useMemo(() => tabCounts(data?.drafts ?? []), [data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{t("posts.title")}</h1>
          {canCurate && <div className="ml-auto flex flex-wrap gap-2">
            <Button onClick={() => setGenOpen(true)}>
              {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}{t("posts.generateIdeas")}
            </Button>
            <NewCarouselButton />
          </div>}
        </div>
        <StepHint step="planner" />
      </div>
      <ModuleSubnav moduleId="marketing" />
      <PipelineStrip current="planner" />

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{t("posts.generateIdeas")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <div>
            <Label>{t("posts.brief")}</Label>
            <Textarea rows={4} value={brief} maxLength={4000} onChange={(e) => setBrief(e.target.value)} placeholder={t("posts.briefHint")}
              className="field-sizing-content min-h-24" />
            <Label className="mt-2 block">{t("common:language")}</Label>
            <Select value={runLanguage} onValueChange={x => setRunLanguage(x as RunLanguage)}><SelectTrigger aria-label={t("common:language")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="project">{t("postLanguage.perProject")}</SelectItem>{POST_LANGUAGES.map(l => <SelectItem key={l} value={l}>{t(`postLanguage.options.${l}`)}</SelectItem>)}</SelectContent></Select>
            <Label className="mt-2 block">{t("posts.focusProject")}</Label>
            <Select value={focusProfile} onValueChange={setFocusProfile}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("posts.focusNone")}</SelectItem>
                {focusOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("posts.periodStart")}</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>{t("posts.periodEnd")}</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <Label>{t("posts.ideaCount")}</Label>
            <Input type="number" min={0} max={10} value={count} className="w-20"
              onChange={(e) => setCount(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
          </div>
          <div>
            <Label>{t("posts.storyCount")}</Label>
            <Input type="number" min={0} max={10} value={storyCount} className="w-20"
              onChange={(e) => setStoryCount(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={!!running || !start || !end || (count + storyCount < 1 && !brief.trim())}>
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            {running ? t("posts.generating") : t("posts.generate")}
          </Button>
          {running && <span className="text-xs text-muted-foreground">{t("posts.generatingHint")}</span>}
        </div>
        </div>

        <div className="space-y-2 border-t pt-3">
        <h2 className="text-sm font-semibold">{t("posts.balance", { count: balance.total })}</h2>
        {balance.total === 0 ? <p className="text-xs text-muted-foreground">{t("posts.balanceEmpty")}</p> : (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="mr-1 text-muted-foreground">{t("detail.pillar")}:</span>
              {balance.pillars.map(([k, n]) => <Badge key={k} variant="outline">{pillarName(k === "—" ? null : k) ?? "—"} · {n}</Badge>)}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="mr-1 text-muted-foreground">{t("detail.persona")}:</span>
              {balance.personas.map(([k, n]) => <Badge key={k} variant="outline">{personaName(k === "—" ? null : k) ?? "—"} · {n}</Badge>)}
            </div>
          </div>
        )}
        </div>
        <div className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-semibold">{t("posts.runHistory")}</h3>
          {(data?.requests ?? []).length === 0 && <p className="text-xs text-muted-foreground">{t("posts.empty")}</p>}
          {(data?.requests ?? []).map((req) => (
            <div key={req.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{req.period_start} → {req.period_end}</span>
              {focusName(req.focus_profile_id) && <Badge variant="secondary">{t("posts.focusLabel", { name: focusName(req.focus_profile_id) })}</Badge>}
              <Badge variant="outline">{t(`posts.requestStatus.${req.status}`)}</Badge>
              <span className="text-muted-foreground">{new Date(req.created_at).toLocaleString()}</span>
              {req.error && <span className={cn("w-full", req.status === "failed" ? "text-destructive" : "text-muted-foreground")}>{req.error}</span>}
              {canCurate && req.status !== "running" && !(data?.drafts ?? []).some((d) => d.request_id === req.id && d.status === "published") && (
                <span className="ml-auto"><DeleteButton label={t("posts.deleteRequest")} ids={[req.id]} column="request_id" /></span>
              )}
            </div>
          ))}
        </div>

        </DialogContent>
      </Dialog>

      <div className="flex gap-1">
        {(["list", "grid"] as const).map((v) => <Button key={v} size="sm" variant={plannerView === v ? "default" : "outline"} onClick={() => setPlannerView(v)}>{t(v === "grid" ? "grid.tab" : "grid.listTab")}</Button>)}
      </div>
      {plannerView === "grid" && <PlannerGrid />}

      {plannerView === "list" && (
        <Tabs value={tab} onValueChange={(v) => navigate({ search: (prev) => ({ ...prev, tab: asPlannerTab(v) }), replace: true })}>
          <TabsList className="flex-wrap">
            {PLANNER_VISIBLE_TABS.map((k) => <TabsTrigger key={k} value={k}>{t(`posts.tabs.${k}`)} <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">{counts[k]}</Badge></TabsTrigger>)}
          </TabsList>
        </Tabs>
      )}

      {plannerView === "list" && isLoading && <p className="text-sm text-muted-foreground">{t("inbox.loading")}</p>}
      {plannerView === "list" && runningReqs.map((r) => (
        <Card key={r.id} className="flex items-center gap-2 border-dashed p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("posts.generating")} <span className="text-xs">· {t("posts.generatingHint")}</span>
        </Card>
      ))}
      {plannerView === "list" && !isLoading && !ideas.length && !runningReqs.length && <p className="text-sm text-muted-foreground">{t("posts.empty")}</p>}
      {plannerView === "list" && ideas.map(({ drafts: ds, runAt }) => (
        <IdeaCard key={ds[0].idea_id} drafts={ds} assetMap={data!.assetMap} tab={tab} runAt={runAt}
          projectName={ds[0].project_id ? data!.projectMap[ds[0].project_id] ?? null : null}
          pillar={pillarName(ds[0].pillar)} persona={personaName(ds[0].persona)} />
      ))}
    </div>
  );
}

/** ~400px WebP previews for list cards (videos stay original); URLs are reused for most of their hour. */
function useSigned(items: { path: string; video?: boolean }[]) {
  return useQuery({
    queryKey: ["marketing-post-urls", PREVIEW_VERSION, items.map((i) => i.path)],
    enabled: items.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => Object.fromEntries(await signPaths(supabase, items, 3600, PREVIEW.tile)) as Record<string, string>,
  });
}

function IdeaCard({ drafts, assetMap, projectName, pillar, persona, tab, runAt }: {
  drafts: Draft[]; assetMap: Record<string, { storage_path: string; file_name: string; mime_type: string }>;
  projectName: string | null; pillar: string | null; persona: string | null; tab: PlannerTab; runAt?: string | null;
}) {
  const { t, i18n } = useTranslation("marketing");
  const first = drafts[0];
  const assets = first.asset_ids.map((id) => assetMap[id]).filter(Boolean);
  const renderedPaths = first.story_render_manifest?.paths ?? [];
  const textFrame = !renderedPaths.length && first.format === "story" ? (first.final_story_frames ?? first.ai_story_frames ?? []).find((f) => f.kind === "text") ?? null : null;
  const { data: urls = {} } = useSigned([...assets.map((a) => ({ path: a.storage_path, video: a.mime_type.startsWith("video/") })), ...renderedPaths.map(path => ({ path }))]);
  const byPlatform = (p: Platform) => drafts.find((d) => d.platform === p);
  const qc = useQueryClient();
  const [rechecking, setRechecking] = useState(false);
  const { allowed: canCurate } = useCan("marketing.curate", "all");
  const recheck = async () => {
    setRechecking(true);
    try { await recheckDrafts(drafts.filter((d) => canRecheckClearance(d.status)).map((d) => d.id)); }
    catch (e) { toast.error((e as { message?: string })?.message || t("posts.error")); }
    setRechecking(false);
    qc.invalidateQueries({ queryKey: ["marketing-posts"] });
  };
  return (
    <Card className="space-y-3 p-4">
      {(assets.length > 0 || textFrame) && (
        <div className="flex snap-x gap-2 overflow-x-auto">
          {textFrame && <div className="relative shrink-0 snap-start"><TextFrameCard frame={textFrame} /><span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 text-xs font-medium">1</span></div>}
          {(renderedPaths.length ? renderedPaths.map(path => ({ storage_path: path, file_name: "Story", mime_type: "image/jpeg" })) : assets).map((a, i) => (
            <div key={a.storage_path} className="relative shrink-0 snap-start">
              {urls[a.storage_path]
                ? (a.mime_type.startsWith("video/")
                  ? <video src={urls[a.storage_path]} controls preload="metadata" className="h-48 rounded" />
                  : <img src={urls[a.storage_path]} alt={a.file_name} loading="lazy" decoding="async" className={cn("rounded bg-muted object-cover object-center", first.format === "story" ? "h-64 w-36" : "h-48 w-48")} />)
                : <div className={cn("animate-pulse rounded bg-muted", first.format === "story" ? "h-64 w-36" : "h-48 w-48")} />}
              {(assets.length > 1 || textFrame) && <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 text-xs font-medium">{i + 1 + (textFrame ? 1 : 0)}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {first.brief_item && <Badge variant="outline" className="border-primary/40 text-primary">{t("posts.briefItem", { item: first.brief_item })}</Badge>}
        {first.format === "story" && <Badge>{t("posts.format.story", { count: assets.length + (textFrame ? 1 : 0) })}</Badge>}
        {first.format === "carousel" && <Badge>{t("posts.format.carousel", { count: assets.length })}</Badge>}
        <Badge variant="outline" className={READY_CLASS[first.readiness]}>{t(`posts.readiness.${first.readiness}`)}</Badge>
        {runAt && <span className="text-xs text-muted-foreground">{t("posts.fromRun", { date: new Date(runAt).toLocaleDateString(i18n.language, { day: "numeric", month: "short", timeZone: "Europe/Lisbon" }) })}</span>}
        {projectName && <Badge variant="secondary">{projectName}</Badge>}
        {pillar && <Badge variant="outline">{pillar}</Badge>}
        {persona && <Badge variant="outline">{persona}</Badge>}
        {canCurate && !drafts.some((d) => d.status === "published") && (
          <span className="ml-auto"><DeleteButton label={t("posts.deleteIdea")} ids={drafts.map((d) => d.id)} column="id" /></span>
        )}
      </div>
      <ClearanceSources draftId={first.id} safetyFlags={first.safety_flags} />
      {canCurate && drafts.some(d => canRecheckClearance(d.status)) && (
        <Button size="sm" variant="outline" className="self-start" disabled={rechecking} onClick={recheck} title={t("posts.recheckHint")}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${rechecking ? "animate-spin" : ""}`} /> {t("posts.recheck")}
        </Button>
      )}
      <p className="text-sm"><span className="text-muted-foreground">{t("posts.rationale")}: </span>{first.rationale}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {first.capture_ids.map((id, i) => (
          <Link key={id} to="/marketing" search={{ capture: id }} className="text-primary underline">{t("posts.sourceCapture", { n: i + 1 })}</Link>
        ))}
      </div>
      {first.format === "story" ? <PlatformDraft draft={first} assets={assets} /> : (() => {
        // In "To review", decided platforms collapse to a status chip; only undecided ones keep their editor.
        const open = (["instagram", "linkedin"] as const).filter((p) => byPlatform(p) && (tab !== "review" || inTab(byPlatform(p)!, "review")));
        const decided = (["instagram", "linkedin"] as const).filter((p) => byPlatform(p) && !open.includes(p));
        return <>
          {decided.length > 0 && <div className="flex flex-wrap gap-1">{decided.map((p) => (
            <Badge key={p} variant="secondary">{t(`posts.platform.${p}`)} · {t(`posts.status.${byPlatform(p)!.status}`)}</Badge>
          ))}</div>}
          {open.length > 0 && <Tabs defaultValue={open[0]}>
            <TabsList>
              {open.map((p) => <TabsTrigger key={p} value={p}>{t(`posts.platform.${p}`)} · {t(`posts.status.${byPlatform(p)!.status}`)}</TabsTrigger>)}
            </TabsList>
            {open.map((p) => <TabsContent key={p} value={p}><PlatformDraft draft={byPlatform(p)!} assets={assets} /></TabsContent>)}
          </Tabs>}
        </>;
      })()}
    </Card>
  );
}

function PlatformDraft({ draft, assets }: { draft: Draft; assets: { storage_path: string; file_name: string }[] }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isStory = draft.format === "story";
  const approvalState = useDraftApprovalState(draft.id);
  const savedFrames = draft.final_story_frames ?? draft.ai_story_frames ?? [];
  const [frames, setFrames] = useState<StoryFrame[]>(savedFrames);
  const translateFn = useServerFn(translatePost);
  const [language, setLanguage] = useState<PostLanguage>(draft.post_language ?? "en");
  const [translating, setTranslating] = useState(false);
  const [plainCopy, setCopy] = useState(draft.final_copy ?? draft.ai_copy);
  const copy = isStory ? renderFrames(frames) : plainCopy;
  const setFrame = (i: number, f: Partial<StoryFrame>) => setFrames((fr) => fr.map((x, j) => (j === i ? { ...x, ...f } : x)));
  const [tags, setTags] = useState((draft.final_hashtags ?? draft.ai_hashtags).join(" "));
  const [showOriginal, setShowOriginal] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pubDate, setPubDate] = useState(iso(new Date()));
  const [pubUrl, setPubUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [editNote, setEditNote] = useState("");
  const warning = useDraftWarningConfirm(draft.id);
  const { allowed: canCurate } = useCan("marketing.curate", "all");
  const locked = !canCurate || draft.status === "rejected" || draft.status === "published" || draft.status === "publishing" || !!draft.publish_sent_at || !!draft.publish_lock_id || !!draft.ig_media_id;
  const parsedTags = tags.split(/[\s,]+/).map((s) => s.replace(/^#+/, "")).filter(Boolean);

  const update = async (patch: Record<string, unknown>, ok: string) => {
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("marketing_post_drafts").update(patch).eq("id", draft.id);
    setSaving(false);
    if (error) { toast.error(error.message || t("posts.error")); return false; }
    if (ok) toast.success(ok);
    qc.invalidateQueries({ queryKey: ["marketing-posts"] });
    qc.invalidateQueries({ queryKey: ["marketing-captures"] });
    qc.invalidateQueries({ queryKey: ["marketing-calendar"] });
    qc.invalidateQueries({ queryKey: ["marketing-draft-approval-state"] });
    return true;
  };
  const rendered = useQuery({ queryKey: ["marketing-story-render", draft.id, draft.story_render_manifest], enabled: isStory, queryFn: () => getStoryRenderContext({ data: { draftId: draft.id } }) });
  const renderSaved = async () => {
    setSaving(true);
    try { await prepareStoryRender(draft.id); await rendered.refetch(); qc.invalidateQueries({ queryKey: ["marketing-posts"] }); qc.invalidateQueries({ queryKey: ["marketing-calendar"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("posts.error")); }
    finally { setSaving(false); }
  };
  const framePatch = isStory ? { final_story_frames: frames } : {};
  const changedFromSaved = language !== draft.post_language || (isStory ? JSON.stringify(frames) !== JSON.stringify(savedFrames) : copy !== (draft.final_copy ?? draft.ai_copy)) || parsedTags.join(" ") !== (draft.final_hashtags ?? draft.ai_hashtags).join(" ");
  const actions = approvalActions(draft.status, approvalState.data?.valid_approval === true, locked, changedFromSaved);
  const saveEdit = async () => {
    const patch: Record<string, unknown> = { post_language: language, final_copy: copy, final_hashtags: parsedTags, ...framePatch };
    if (editNote.trim()) patch.decision_note = editNote.trim().slice(0, 500);
    if (await update(patch, t("posts.editSaved"))) {
      setEditNote("");
      if (isStory) await renderSaved();
      try { await recheckDrafts([draft.id]); } catch { /* badge refreshes on next load */ }
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
    }
  };
  const edited = (isStory ? JSON.stringify(frames) !== JSON.stringify(draft.ai_story_frames ?? []) : copy !== draft.ai_copy) || parsedTags.join(" ") !== draft.ai_hashtags.join(" ");
  const approve = async () => {
    const patch = { post_language: language, final_copy: copy, final_hashtags: parsedTags, ...framePatch,
      decision_note: editNote.trim() ? editNote.trim().slice(0, 500) : (edited ? (draft.decision_note ?? null) : null) };
    if (isStory || (actions.needsReapproval && changedFromSaved)) {
      if (!await update(patch, "")) return false;
    }
    if (isStory) {
      try { setSaving(true); await prepareStoryRender(draft.id); } catch(e) { toast.error(e instanceof Error ? e.message : t("posts.error")); return false; } finally { setSaving(false); }
    }
    return warning.run(async () => {
      if (actions.needsReapproval) {
        const { error } = await supabase.rpc('marketing_prepare_reapproval', { _draft: draft.id });
        if (error) { toast.error(error.message); return false; }
      }
      const ok = await update({ status: "approved", ...patch }, "");
      if (ok) toast.success(t("posts.approvedSchedule"), { action: { label: t("posts.openCalendar"), onClick: () => navigate({ to: "/marketing/calendar" }) } });
      return ok;
    }, patch);
  };
  const reject = async () => {
    if (await update({ status: "rejected", decision_note: reason.trim() || null }, t("posts.rejected"))) setRejectOpen(false);
  };
  const publish = async () => {
    if (await update({ status: "published", published_at: pubDate, published_url: pubUrl.trim() || null }, t("posts.publishedToast"))) setPubOpen(false);
  };
  const translate = async (target: "en" | "pt-PT") => {
    setTranslating(true);
    try {
      const r = await translateFn({data:{draftId:draft.id,language:target,copy,hashtags:parsedTags,...(isStory ? {frames} : {})}});
      setCopy(r.copy); setTags(r.hashtags.join(" ")); if (r.frames) setFrames(r.frames as StoryFrame[]); setLanguage(r.language); setShowOriginal(false);
      toast.success(t("postLanguage.translated"));
    } catch(e) { const msg=e instanceof Error ? e.message : String(e); toast.error(/credits|spending|credit_limit|402|AI access denied/i.test(msg) ? `${t("postLanguage.aiBlocked")} ${msg}` : msg); }
    finally { setTranslating(false); }
  };
  const copyText = async () => {
    const txt = isStory ? frames.map((f, i) => `${t("posts.frame", { n: i + 1 })}: ${f.text}${f.sticker.type !== "none" ? `\n${t(`posts.sticker.${f.sticker.type}`)}: ${f.sticker.text}` : ""}`).join("\n\n") : `${copy}${parsedTags.length ? `\n\n${parsedTags.map((h) => `#${h}`).join(" ")}` : ""}`;
    await navigator.clipboard.writeText(txt);
    toast.success(t("posts.copied"));
  };
  const download = async () => {
    const tf = isStory ? frames.find((f) => f.kind === "text") : null;
    if (tf) { const { renderStoryFrame } = await import("@/lib/marketing/story-render"); const b = await renderStoryFrame(tf); const url = URL.createObjectURL(b); const a = document.createElement("a"); a.href=url; a.download="story-1.jpg"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
    for (const a of assets) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 600, { download: a.file_name });
      if (data?.signedUrl) {
        const el = document.createElement("a");
        el.href = data.signedUrl;
        el.download = a.file_name;
        document.body.appendChild(el);
        el.click();
        el.remove();
      }
    }
  };

  return (
    <div className="space-y-2" id={`draft-${draft.id}`}>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" data-post-language={language}>{languageChip(language)}</Badge>{!locked && (["pt-PT","en"] as const).map(l => <Button key={l} size="sm" variant="outline" disabled={saving || translating} onClick={() => translate(l)}>{translating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}{t(l === "pt-PT" ? "postLanguage.translatePt" : "postLanguage.translateEn")}</Button>)}</div>
      {isStory ? (
        <div className="space-y-2">
          {(showOriginal ? draft.ai_story_frames ?? [] : frames).map((f, i) => (
            <div key={i} className="space-y-1 rounded-md border p-2">
              {f.sticker?.type !== "none" && <div className="space-y-1"><p className="text-xs text-warning">{t("storyRender.stickerWarning")}</p><Select value={f.sticker_policy ?? "unresolved"} disabled={locked || showOriginal} onValueChange={v => setFrame(i, { sticker_policy: v as "omit" | "manual" })}><SelectTrigger aria-label={t("storyRender.stickerChoice")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unresolved">{t("storyRender.choose")}</SelectItem><SelectItem value="omit">{t("storyRender.omit")}</SelectItem><SelectItem value="manual">{t("storyRender.manual")}</SelectItem></SelectContent></Select></div>}
              <Label className="text-xs">{t("posts.frame", { n: i + 1 })}{f.kind === "text" ? ` · ${t("posts.textFrame")}` : ""}</Label>
              {f.kind === "text" ? <>
                <Input value={f.text} maxLength={100} disabled={locked || showOriginal} onChange={(e) => setFrame(i, { text: e.target.value })} aria-label={t("posts.textFrameHeadline")} placeholder={t("posts.textFrameHeadline")} />
                <Input value={f.line ?? ""} maxLength={160} disabled={locked || showOriginal} onChange={(e) => setFrame(i, { line: e.target.value || null })} aria-label={t("posts.textFrameLine")} placeholder={t("posts.textFrameLine")} />
              </> : <>
              <Input value={f.text} maxLength={140} disabled={locked || showOriginal} onChange={(e) => setFrame(i, { text: e.target.value })} aria-label={t("posts.frame", { n: i + 1 })} />
              <div className="flex gap-2">
                <Select value={f.sticker.type} disabled={locked || showOriginal}
                  onValueChange={(v) => setFrames((fr) => fr.map((x, j) => (j === i ? { ...x, sticker: { type: v as StickerType, text: v === "none" ? "" : x.sticker.text } } : v !== "none" && x.sticker.type !== "none" ? { ...x, sticker: { type: "none", text: "" } } : x)))}>
                  <SelectTrigger className="w-36" aria-label={t("posts.stickerLabel")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["none", "poll", "question", "link"] as const).map((k) => <SelectItem key={k} value={k}>{t(`posts.sticker.${k}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {f.sticker.type !== "none" && (
                  <Input value={f.sticker.text} maxLength={100} disabled={locked || showOriginal}
                    onChange={(e) => setFrame(i, { sticker: { ...f.sticker, text: e.target.value } })} aria-label={t("posts.stickerLabel")} />
                )}
              </div>
              </>}
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={renderSaved} disabled={saving || changedFromSaved}>{saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}{t("storyRender.render")}</Button>
          {rendered.data?.manifest && !changedFromSaved && <div className="flex gap-2 overflow-x-auto">{rendered.data.manifest.paths.map((p,i) => <img key={p} data-story-frame={i+1} src={rendered.data?.urls[p]} alt={t("posts.frame", { n:i+1 })} className="h-80 w-44 shrink-0 rounded object-contain" />)}</div>}
          {rendered.data?.manifest?.automatic === false && <p className="text-xs text-warning">{t("storyRender.blocked")}</p>}
          <p className="text-xs text-muted-foreground">{t("posts.storyHint")}</p>
        </div>
      ) : showOriginal ? (
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
          <p className="whitespace-pre-wrap">{draft.ai_copy}</p>
          <p className="text-xs text-muted-foreground">{draft.ai_hashtags.map((h) => `#${h}`).join(" ")}</p>
        </div>
      ) : (
        <>
          {canCurate ? <>
          <Textarea rows={draft.platform === "linkedin" ? 10 : 6} value={copy} onChange={(e) => setCopy(e.target.value)} disabled={locked} />
          <Input value={tags} onChange={(e) => setTags(e.target.value)} disabled={locked} placeholder={t("posts.hashtags")} />
          </> : <div className="space-y-1 rounded-md border p-3 text-sm">
            <p className="whitespace-pre-wrap">{copy}</p>
            <p className="text-xs text-muted-foreground">{parsedTags.map((h) => `#${h}`).join(" ")}</p>
          </div>}
          <p className="text-xs text-muted-foreground">{t("posts.words", { count: copy.trim() ? copy.trim().split(/\s+/).length : 0 })}</p>
        </>
      )}
      {draft.decision_note && <p className="text-xs text-muted-foreground">{t("posts.decisionNote")}: {draft.decision_note}</p>}
      {draft.status === "published" && (
        <p className="text-xs text-muted-foreground">
          {t("posts.publishedOn", { date: draft.published_at })}{" "}
          {draft.published_url && <a href={draft.published_url} target="_blank" rel="noreferrer" className="text-primary underline">{draft.published_url}</a>}
        </p>
      )}
      {(actions.needsReapproval || (draft.edited_after_approval && draft.status === "suggested")) && (
        <p className="text-xs text-warning">{t("posts.editedAfterApproval")}</p>
      )}
      {!locked && (edited || changedFromSaved) && (
        <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} maxLength={500}
          placeholder={t("posts.editNote")} aria-label={t("posts.editNote")} />
      )}
      <div className="flex flex-wrap gap-2">
        {actions.canApprove && approvalState.isSuccess && (
          <>
            <Button size="sm" onClick={approve} disabled={saving || translating}>
              <Check className="mr-1 h-3.5 w-3.5" /> {t("posts.approve")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={saving || translating}>
              <X className="mr-1 h-3.5 w-3.5" /> {t("posts.reject")}
            </Button>
          </>
        )}
        {!locked && changedFromSaved && (
          <Button size="sm" variant="outline" onClick={saveEdit} disabled={saving || translating}>
            <Save className="mr-1 h-3.5 w-3.5" /> {t("posts.saveEdit")}
          </Button>
        )}
        {draft.status === "approved" && !draft.scheduled_at && actions.canPublish && (
          <Button size="sm" variant="secondary" asChild><Link to="/marketing/calendar"><CalendarDays className="mr-1 h-3.5 w-3.5" /> {t("posts.schedule")}</Link></Button>
        )}
        {canCurate && draft.platform !== "instagram" && draft.status === "approved" && actions.canPublish && <Button size="sm" onClick={() => setPubOpen(true)} disabled={saving || translating}>{t("posts.markPublished")}</Button>}
        <Button size="sm" variant="outline" onClick={copyText}><Copy className="mr-1 h-3.5 w-3.5" /> {t("posts.copyText")}</Button>
        {(assets.length > 0 || (isStory && frames.some((f) => f.kind === "text"))) && <Button size="sm" variant="outline" onClick={download}><Download className="mr-1 h-3.5 w-3.5" /> {t("posts.downloadImages")}</Button>}
        <Button size="sm" variant="ghost" onClick={() => setShowOriginal((s) => !s)}>{showOriginal ? t("posts.showEdited") : t("posts.showOriginal")}</Button>
      </div>
      {draft.scheduled_at && <p className="text-xs text-muted-foreground">{t("calendar.scheduledFor", { when: new Date(draft.scheduled_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "medium", timeStyle: "short" }) })}</p>}
      {draft.platform === "instagram" && <InstagramPublishControls draftId={draft.id} status={draft.status} canCurate={canCurate && !changedFromSaved} error={draft.publish_error_message} permalink={draft.published_url} sentAt={draft.publish_sent_at}/>}
      <PostApprovalControls isStory={isStory} draftId={draft.id} status={draft.status} readiness={draft.readiness} needsReapproval={approvalState.isSuccess && actions.needsReapproval && !locked} canCurate={!locked && !changedFromSaved} />
      {warning.dialog}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("posts.rejectTitle")}</DialogTitle></DialogHeader>
          <Label>{t("posts.rejectReason")}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("posts.rejectHint")}</p>
          <DialogFooter><Button onClick={reject} disabled={saving || translating}>{t("posts.reject")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={pubOpen} onOpenChange={setPubOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("posts.markPublished")}</DialogTitle></DialogHeader>
          <Label>{t("posts.publishedDate")}</Label>
          <Input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)} />
          <Label>{t("posts.publishedUrl")}</Label>
          <Input value={pubUrl} onChange={(e) => setPubUrl(e.target.value)} placeholder="https://" />
          <DialogFooter><Button onClick={publish} disabled={saving || !pubDate}>{t("posts.markPublished")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
