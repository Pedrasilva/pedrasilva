import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, Loader2, RefreshCw, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { V2PermissionGate } from "@/components/PermissionGate";
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

export const Route = createFileRoute("/_app/marketing/posts")({
  validateSearch: (s: Record<string, unknown>): { request?: string } =>
    typeof s.request === "string" ? { request: s.request } : {},
  component: () => (
    <V2PermissionGate permission="marketing.curate" scope="all">
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
const STATUSES = ["suggested", "approved", "rejected", "published"] as const;
type Platform = "instagram" | "linkedin";
type Draft = {
  id: string; request_id: string; idea_id: string; platform: Platform; capture_ids: string[]; asset_ids: string[];
  project_id: string | null; pillar: string | null; persona: string | null; ai_copy: string; ai_hashtags: string[];
  final_copy: string | null; final_hashtags: string[] | null; rationale: string;
  readiness: "ready" | "needs_approval" | "blocked"; readiness_note: string | null; safety_flags: string[];
  status: (typeof STATUSES)[number]; decision_note: string | null; decided_at: string | null;
  published_at: string | null; published_url: string | null; created_at: string;
};
type Req = { id: string; brief: string | null; period_start: string; period_end: string; idea_count: number; status: string; error: string | null; created_at: string };

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
    refetchInterval: (q) => ((q.state.data as { requests: Req[] } | undefined)?.requests.some((r) => r.status === "running") ? 4000 : false),
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
      const [{ data: assets }, { data: projects }] = await Promise.all([
        assetIds.length ? sb.from("marketing_capture_assets").select("id, storage_path, file_name, mime_type").in("id", assetIds) : { data: [] },
        projectIds.length ? sb.from("pm_projects").select("id, name").in("id", projectIds) : { data: [] },
      ]);
      const assetMap: Record<string, { storage_path: string; file_name: string; mime_type: string }> = {};
      for (const a of assets ?? []) assetMap[a.id] = a;
      const projectMap: Record<string, string> = {};
      for (const p of projects ?? []) projectMap[p.id] = p.name;
      return { requests: (requests ?? []) as Req[], drafts: ds, assetMap, projectMap };
    },
  });
}

async function recheckDrafts(ids: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (supabase as any).rpc.bind(supabase);
  const results = await Promise.all(ids.map((id) => rpc("marketing_recheck_draft_readiness", { _draft_id: id })));
  const err = results.find((r: { error: unknown }) => r.error);
  if (err) throw err.error;
}

function PostPlannerPage() {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const { request: focusRequest } = Route.useSearch();
  const generate = useServerFn(generatePostSuggestions);
  const [defStart, defEnd] = nextWeek();
  const [brief, setBrief] = useState("");
  const [start, setStart] = useState(defStart);
  const [end, setEnd] = useState(defEnd);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const { data, isLoading } = usePlannerData();
  const { data: bible } = useActiveBible();
  const rechecked = useRef(new Set<string>());
  useEffect(() => {
    const ids = (data?.drafts ?? []).filter((d) => d.status === "suggested" && !rechecked.current.has(d.id)).map((d) => d.id);
    if (!ids.length) return;
    ids.forEach((id) => rechecked.current.add(id));
    recheckDrafts(ids).then(() => qc.invalidateQueries({ queryKey: ["marketing-posts"] })).catch(() => {});
  }, [data, qc]);

  const pillarName = (k: string | null) => (k ? bible?.pillars.find((p) => p.key === k)?.name ?? k : null);
  const personaName = (k: string | null) => (k ? bible?.personas.find((p) => p.key === k)?.name ?? k : null);

  const run = async () => {
    setBusy(true);
    setTimeout(() => qc.invalidateQueries({ queryKey: ["marketing-posts"] }), 1500);
    try {
      const r = await generate({ data: { brief: brief || null, periodStart: start, periodEnd: end, ideaCount: count } });
      if (r.ok) toast.success(t("posts.generated", { count: r.ideas }));
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

  const groups = useMemo(() => {
    const reqs = data?.requests ?? [];
    const ordered = focusRequest ? [...reqs.filter((r) => r.id === focusRequest), ...reqs.filter((r) => r.id !== focusRequest)] : reqs;
    return ordered.map((r) => {
      const ideas = new Map<string, Draft[]>();
      for (const d of data?.drafts ?? []) {
        if (d.request_id !== r.id) continue;
        ideas.set(d.idea_id, [...(ideas.get(d.idea_id) ?? []), d]);
      }
      const list = [...ideas.values()].filter((ds) => statusFilter === "all" || ds.some((d) => d.status === statusFilter));
      return { req: r, ideas: list };
    });
  }, [data, statusFilter, focusRequest]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("posts.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("posts.subtitle")}</p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div>
            <Label>{t("posts.brief")}</Label>
            <Input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t("posts.briefHint")} />
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
            <Input type="number" min={1} max={10} value={count} className="w-20"
              onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={!!running || !start || !end}>
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            {running ? t("posts.generating") : t("posts.generate")}
          </Button>
          {running && <span className="text-xs text-muted-foreground">{t("posts.generatingHint")}</span>}
        </div>
      </Card>

      <Card className="space-y-2 p-4">
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
      </Card>

      <div className="flex items-center gap-2">
        <Label className="text-sm">{t("filters.status")}</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.all")}</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`posts.status.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t("inbox.loading")}</p>}
      {!isLoading && !groups.length && <p className="text-sm text-muted-foreground">{t("posts.empty")}</p>}

      {groups.map(({ req, ideas }) => (
        <section key={req.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2 border-b pb-1">
            <h2 className="text-sm font-semibold">{req.period_start} → {req.period_end}</h2>
            {req.brief && <span className="text-xs text-muted-foreground">“{req.brief}”</span>}
            <Badge variant="outline">{t(`posts.requestStatus.${req.status}`)}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(req.created_at).toLocaleString()}</span>
          </div>
          {req.status === "running" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("posts.generating")}</p>}
          {req.error && <p className={cn("text-sm", req.status === "failed" ? "text-destructive" : "text-muted-foreground")}>{req.error}</p>}
          {ideas.map((ds) => (
            <IdeaCard key={ds[0].idea_id} drafts={ds} assetMap={data!.assetMap}
              projectName={ds[0].project_id ? data!.projectMap[ds[0].project_id] ?? null : null}
              pillar={pillarName(ds[0].pillar)} persona={personaName(ds[0].persona)} />
          ))}
        </section>
      ))}
    </div>
  );
}

function useSigned(paths: string[]) {
  return useQuery({
    queryKey: ["marketing-post-urls", paths],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      const m: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      return m;
    },
  });
}

function IdeaCard({ drafts, assetMap, projectName, pillar, persona }: {
  drafts: Draft[]; assetMap: Record<string, { storage_path: string; file_name: string; mime_type: string }>;
  projectName: string | null; pillar: string | null; persona: string | null;
}) {
  const { t } = useTranslation("marketing");
  const first = drafts[0];
  const assets = first.asset_ids.map((id) => assetMap[id]).filter(Boolean);
  const { data: urls = {} } = useSigned(assets.map((a) => a.storage_path));
  const byPlatform = (p: Platform) => drafts.find((d) => d.platform === p);
  return (
    <Card className="space-y-3 p-4">
      {assets.length > 0 && (
        <div className="flex snap-x gap-2 overflow-x-auto">
          {assets.map((a) => urls[a.storage_path]
            ? (a.mime_type.startsWith("video/")
              ? <video key={a.storage_path} src={urls[a.storage_path]} controls className="h-48 shrink-0 snap-start rounded" />
              : <img key={a.storage_path} src={urls[a.storage_path]} alt={a.file_name} className="h-48 shrink-0 snap-start rounded object-cover" />)
            : <div key={a.storage_path} className="h-48 w-48 shrink-0 rounded bg-muted" />)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={READY_CLASS[first.readiness]}>{t(`posts.readiness.${first.readiness}`)}</Badge>
        {projectName && <Badge variant="secondary">{projectName}</Badge>}
        {pillar && <Badge variant="outline">{pillar}</Badge>}
        {persona && <Badge variant="outline">{persona}</Badge>}
      </div>
      {first.readiness_note && <p className="text-sm text-warning">{first.readiness_note}</p>}
      {first.status === "suggested" && first.readiness !== "ready" && (
        <Button size="sm" variant="outline" className="self-start" disabled={rechecking} onClick={recheck}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${rechecking ? "animate-spin" : ""}`} /> {t("posts.recheck")}
        </Button>
      )}
      {first.safety_flags.length > 0 && (
        <div className="flex flex-wrap gap-1">{first.safety_flags.map((f) => <Badge key={f} variant="outline" className={READY_CLASS.blocked}>{f}</Badge>)}</div>
      )}
      <p className="text-sm"><span className="text-muted-foreground">{t("posts.rationale")}: </span>{first.rationale}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {first.capture_ids.map((id, i) => (
          <Link key={id} to="/marketing" search={{ capture: id }} className="text-primary underline">{t("posts.sourceCapture", { n: i + 1 })}</Link>
        ))}
      </div>
      <Tabs defaultValue="instagram">
        <TabsList>
          {(["instagram", "linkedin"] as const).map((p) => byPlatform(p) && (
            <TabsTrigger key={p} value={p}>{t(`posts.platform.${p}`)} · {t(`posts.status.${byPlatform(p)!.status}`)}</TabsTrigger>
          ))}
        </TabsList>
        {(["instagram", "linkedin"] as const).map((p) => byPlatform(p) && (
          <TabsContent key={p} value={p}><PlatformDraft draft={byPlatform(p)!} assets={assets} /></TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function PlatformDraft({ draft, assets }: { draft: Draft; assets: { storage_path: string; file_name: string }[] }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const [copy, setCopy] = useState(draft.final_copy ?? draft.ai_copy);
  const [tags, setTags] = useState((draft.final_hashtags ?? draft.ai_hashtags).join(" "));
  const [showOriginal, setShowOriginal] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pubDate, setPubDate] = useState(iso(new Date()));
  const [pubUrl, setPubUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = draft.status !== "suggested";
  const parsedTags = tags.split(/[\s,]+/).map((s) => s.replace(/^#+/, "")).filter(Boolean);

  const update = async (patch: Record<string, unknown>, ok: string) => {
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("marketing_post_drafts").update(patch).eq("id", draft.id);
    setSaving(false);
    if (error) { toast.error(error.message || t("posts.error")); return false; }
    toast.success(ok);
    qc.invalidateQueries({ queryKey: ["marketing-posts"] });
    qc.invalidateQueries({ queryKey: ["marketing-captures"] });
    return true;
  };
  const saveEdit = async () => {
    if (await update({ final_copy: copy, final_hashtags: parsedTags }, t("posts.editSaved"))) {
      try { await recheckDrafts([draft.id]); } catch { /* badge refreshes on next load */ }
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
    }
  };
  const edited = copy !== draft.ai_copy || parsedTags.join(" ") !== draft.ai_hashtags.join(" ");
  const approve = () => update({
    status: "approved", final_copy: copy, final_hashtags: parsedTags,
    decision_note: edited ? "Edited before approval" : null,
  }, t("posts.approved"));
  const reject = async () => {
    if (await update({ status: "rejected", decision_note: reason.trim() || null }, t("posts.rejected"))) setRejectOpen(false);
  };
  const publish = async () => {
    if (await update({ status: "published", published_at: pubDate, published_url: pubUrl.trim() || null }, t("posts.publishedToast"))) setPubOpen(false);
  };
  const copyText = async () => {
    const txt = `${copy}${parsedTags.length ? `\n\n${parsedTags.map((h) => `#${h}`).join(" ")}` : ""}`;
    await navigator.clipboard.writeText(txt);
    toast.success(t("posts.copied"));
  };
  const download = async () => {
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
    <div className="space-y-2">
      {showOriginal ? (
        <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
          <p className="whitespace-pre-wrap">{draft.ai_copy}</p>
          <p className="text-xs text-muted-foreground">{draft.ai_hashtags.map((h) => `#${h}`).join(" ")}</p>
        </div>
      ) : (
        <>
          <Textarea rows={draft.platform === "linkedin" ? 10 : 6} value={copy} onChange={(e) => setCopy(e.target.value)} disabled={locked} />
          <Input value={tags} onChange={(e) => setTags(e.target.value)} disabled={locked} placeholder={t("posts.hashtags")} />
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
      <div className="flex flex-wrap gap-2">
        {draft.status === "suggested" && (
          <>
            <Button size="sm" onClick={approve} disabled={saving || draft.readiness !== "ready"} title={draft.readiness !== "ready" ? t("posts.approveDisabled") : undefined}>
              <Check className="mr-1 h-3.5 w-3.5" /> {t("posts.approve")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={saving}>
              <X className="mr-1 h-3.5 w-3.5" /> {t("posts.reject")}
            </Button>
            {(copy !== (draft.final_copy ?? draft.ai_copy) || parsedTags.join(" ") !== (draft.final_hashtags ?? draft.ai_hashtags).join(" ")) && (
              <Button size="sm" variant="outline" onClick={saveEdit} disabled={saving}>
                <Save className="mr-1 h-3.5 w-3.5" /> {t("posts.saveEdit")}
              </Button>
            )}
          </>
        )}
        {draft.status === "approved" && <Button size="sm" onClick={() => setPubOpen(true)} disabled={saving}>{t("posts.markPublished")}</Button>}
        <Button size="sm" variant="outline" onClick={copyText}><Copy className="mr-1 h-3.5 w-3.5" /> {t("posts.copyText")}</Button>
        {assets.length > 0 && <Button size="sm" variant="outline" onClick={download}><Download className="mr-1 h-3.5 w-3.5" /> {t("posts.downloadImages")}</Button>}
        <Button size="sm" variant="ghost" onClick={() => setShowOriginal((s) => !s)}>{showOriginal ? t("posts.showEdited") : t("posts.showOriginal")}</Button>
      </div>
      {draft.status === "suggested" && draft.readiness !== "ready" && <p className="text-xs text-muted-foreground">{t("posts.approveDisabled")}</p>}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("posts.rejectTitle")}</DialogTitle></DialogHeader>
          <Label>{t("posts.rejectReason")}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("posts.rejectHint")}</p>
          <DialogFooter><Button onClick={reject} disabled={saving}>{t("posts.reject")}</Button></DialogFooter>
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
