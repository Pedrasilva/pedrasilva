import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, ImageIcon, Lightbulb, Link2, Plus, RefreshCw, Sparkles, Video } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { reenrichCapture } from "@/lib/marketing/enrich.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useActiveBible } from "@/lib/marketing/bible";
import { strictestClearance, useProjectProfiles, type ProjectProfile } from "@/lib/marketing/projects";

export const Route = createFileRoute("/_app/marketing/")({
  validateSearch: (s: Record<string, unknown>): { capture?: string } =>
    typeof s.capture === "string" ? { capture: s.capture } : {},
  component: MarketingInboxPage,
  head: () => ({
    meta: [
      { title: "Marketing Inbox — Portal Pedra Silva" },
      { name: "description", content: "Team content pool of photos, videos, ideas and client stories." },
      { property: "og:title", content: "Marketing Inbox — Portal Pedra Silva" },
      { property: "og:description", content: "Team content pool of photos, videos, ideas and client stories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUSES = ["new", "enriched", "ready", "used", "archived"] as const;
const CLEARANCES = ["unknown", "cleared", "needs_client_approval", "internal_only"] as const;
const SECTORS = ["workspace", "healthcare", "residential", "hospitality", "other"] as const;
const STAGES = ["design", "construction", "completed", "other"] as const;
const CHANNELS = ["hub", "email", "whatsapp"] as const;
const CONTENT_TYPES = ["photo", "video", "idea", "story", "quote", "link"] as const;
const SHELF = ["urgent", "seasonal", "evergreen"] as const;
const BUCKET = "marketing-assets";
const MAX_BYTES = 500 * 1024 * 1024;
const TUS_THRESHOLD = 6 * 1024 * 1024;

/** Resumable (TUS) upload to the private bucket, reporting 0–100 progress. */
async function uploadResumable(path: string, file: File, onProgress: (pct: number) => void) {
  const { Upload } = await import("tus-js-client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No session");
  await new Promise<void>((resolve, reject) => {
    const up = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType: file.type, cacheControl: "3600" },
      chunkSize: 6 * 1024 * 1024,
      onError: reject,
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
    });
    up.findPreviousUploads().then((prev) => {
      if (prev.length) up.resumeFromPreviousUpload(prev[0]);
      up.start();
    });
  });
}
const NONE = "__none";
const ALL = "__all";
const ACTIVE = "__active";

type Asset = { id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number };
type Capture = {
  id: string;
  created_by: string | null;
  channel: (typeof CHANNELS)[number];
  sender_name: string | null;
  sender_email: string | null;
  raw_text: string | null;
  received_at: string;
  project_id: string | null;
  sector: (typeof SECTORS)[number] | null;
  stage: (typeof STAGES)[number] | null;
  content_type: (typeof CONTENT_TYPES)[number] | null;
  pillar: string | null;
  persona: string | null;
  fit_score: number | null;
  ai_summary: string | null;
  missing_notes: string | null;
  ai_flags: string[];
  ai_project_guess: string | null;
  enriched_at: string | null;
  enriched_bible_version: number | null;
  enrichment_model: string | null;
  enrichment_error: string | null;
  curator_notes: string | null;
  status: (typeof STATUSES)[number];
  clearance: (typeof CLEARANCES)[number];
  shelf_life: (typeof SHELF)[number] | null;
  expires_at: string | null;
  marketing_capture_assets: Asset[];
};

const CLEARANCE_CLASS: Record<Capture["clearance"], string> = {
  cleared: "bg-success/15 text-success border-success/30",
  needs_client_approval: "bg-warning/15 text-warning border-warning/30",
  internal_only: "bg-destructive/15 text-destructive border-destructive/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

const isAllowedType = (f: File) =>
  f.type.startsWith("image/") || f.type.startsWith("video/") || f.type === "application/pdf";

function useProjects() {
  return useQuery({
    queryKey: ["marketing-projects"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("pm_projects").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

function useCaptures() {
  return useQuery({
    queryKey: ["marketing-captures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_captures")
        .select("*, marketing_capture_assets(id, storage_path, file_name, mime_type, size_bytes)")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Capture[];
    },
  });
}

/** Signed URLs only — the bucket is private. */
function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: ["marketing-signed", paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      return map;
    },
  });
}

function MarketingInboxPage() {
  const { t } = useTranslation("marketing");
  const { can } = useMyPermissionsV2();
  const canContribute = can("marketing.contribute", "own");
  const { data: captures = [], isLoading } = useCaptures();
  const { data: projects = [] } = useProjects();
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const [status, setStatus] = useState<string>(ACTIVE);
  const [sector, setSector] = useState<string>(ALL);
  const [clearance, setClearance] = useState<string>(ALL);
  const [channel, setChannel] = useState<string>(ALL);
  const [project, setProject] = useState<string>(ALL);
  const [sort, setSort] = useState<string>("newest");
  const [addOpen, setAddOpen] = useState(false);
  const search = Route.useSearch();
  const [openId, setOpenId] = useState<string | null>(search.capture ?? null);
  const { data: profiles = [] } = useProjectProfiles();
  const profileByProject = useMemo(() => new Map(profiles.map((p) => [p.project_id, p])), [profiles]);
  const effective = (c: Capture) => strictestClearance(c.clearance, c.project_id ? profileByProject.get(c.project_id)?.clearance : null);

  const filtered = captures.filter(
    (c) =>
      (status === ACTIVE ? c.status !== "archived" : status === ALL || c.status === status) &&
      (sector === ALL || c.sector === sector) &&
      (clearance === ALL || c.clearance === clearance) &&
      (channel === ALL || c.channel === channel) &&
      (project === ALL || c.project_id === project),
  ).sort((a, b) => sort === "fit"
    ? (b.fit_score ?? -1) - (a.fit_score ?? -1) || b.received_at.localeCompare(a.received_at)
    : b.received_at.localeCompare(a.received_at));

  const thumbPaths = filtered
    .map((c) => c.marketing_capture_assets.find((a) => a.mime_type.startsWith("image/"))?.storage_path)
    .filter((p): p is string => !!p);
  const { data: thumbs = {} } = useSignedUrls(thumbPaths);
  const selected = captures.find((c) => c.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("inbox.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("inbox.subtitle")}</p>
        </div>
        {canContribute && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("inbox.add")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterSelect label={t("filters.status")} value={status} onChange={setStatus}
          options={[{ v: ACTIVE, l: t("filters.activeOnly") }, { v: ALL, l: t("filters.all") }, ...STATUSES.map((s) => ({ v: s, l: t(`status.${s}`) }))]} />
        <FilterSelect label={t("filters.sector")} value={sector} onChange={setSector}
          options={[{ v: ALL, l: t("filters.all") }, ...SECTORS.map((s) => ({ v: s, l: t(`sector.${s}`) }))]} />
        <FilterSelect label={t("filters.clearance")} value={clearance} onChange={setClearance}
          options={[{ v: ALL, l: t("filters.all") }, ...CLEARANCES.map((s) => ({ v: s, l: t(`clearance.${s}`) }))]} />
        <FilterSelect label={t("filters.channel")} value={channel} onChange={setChannel}
          options={[{ v: ALL, l: t("filters.all") }, ...CHANNELS.map((s) => ({ v: s, l: t(`channel.${s}`) }))]} />
        <FilterSelect label={t("filters.project")} value={project} onChange={setProject}
          options={[{ v: ALL, l: t("filters.all") }, ...projects.map((p) => ({ v: p.id, l: p.name }))]} />
        <FilterSelect label={t("ai.sort")} value={sort} onChange={setSort}
          options={[{ v: "newest", l: t("ai.sortNewest") }, { v: "fit", l: t("ai.sortFit") }]} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("inbox.loading")}</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">{t("inbox.empty")}</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => {
            const img = c.marketing_capture_assets.find((a) => a.mime_type.startsWith("image/"));
            const hasVideo = c.marketing_capture_assets.some((a) => a.mime_type.startsWith("video/"));
            const Icon = hasVideo ? Video : c.content_type === "link" ? Link2 : c.content_type === "idea" ? Lightbulb : ImageIcon;
            return (
              <Card key={c.id} className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md" onClick={() => setOpenId(c.id)}>
                <div className="flex aspect-video items-center justify-center bg-muted">
                  {img && thumbs[img.storage_path] ? (
                    <img src={thumbs[img.storage_path]} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Icon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <p className="line-clamp-3 text-sm">{(c.raw_text ?? "").slice(0, 140)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.sender_name ?? c.sender_email ?? t("detail.unknownSender")} · {new Date(c.received_at).toLocaleDateString()}
                  </p>
                  {c.project_id && <p className="truncate text-xs font-medium">{projectName.get(c.project_id)}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{t(`channel.${c.channel}`)}</Badge>
                    <Badge variant="secondary">{t(`status.${c.status}`)}</Badge>
                    <Badge variant="outline" className={CLEARANCE_CLASS[effective(c)]}>{t(`clearance.${effective(c)}`)}</Badge>
                    {c.fit_score != null && <Badge title={t("detail.fitScore")}>{Number(c.fit_score).toFixed(1)}</Badge>}
                    {c.ai_flags?.length > 0 && (
                      <span title={c.ai_flags.join(", ")} aria-label={t("ai.flags")} className="inline-flex items-center text-warning">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddCaptureDialog open={addOpen} onOpenChange={setAddOpen} projects={projects} />
      <CaptureDrawer capture={selected} onClose={() => setOpenId(null)} projects={projects}
        profile={selected?.project_id ? profileByProject.get(selected.project_id) ?? null : null} />
    </div>
  );
}

function FilterSelect(props: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[140px]" aria-label={props.label}>
        <span className="mr-1 text-muted-foreground">{props.label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((o) => (
          <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OptSelect(props: { label: string; value: string | null; onChange: (v: string | null) => void; options: { v: string; l: string }[]; disabled?: boolean; noneLabel: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{props.label}</Label>
      <Select value={props.value ?? NONE} onValueChange={(v) => props.onChange(v === NONE ? null : v)} disabled={props.disabled}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{props.noneLabel}</SelectItem>
          {props.options.map((o) => (
            <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AddCaptureDialog({ open, onOpenChange, projects }: { open: boolean; onOpenChange: (o: boolean) => void; projects: { id: string; name: string }[] }) {
  const { t } = useTranslation("marketing");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<Record<number, number>>({});

  const reset = () => { setText(""); setProjectId(null); setSector(null); setStage(null); setFiles([]); };

  const pickFiles = (list: FileList | null) => {
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      if (!isAllowedType(f)) toast.error(t("add.invalidType", { file: f.name }));
      else if (f.size > MAX_BYTES) toast.error(t("add.tooLarge", { file: f.name }));
      else ok.push(f);
    }
    setFiles(ok);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    // Sender, creator and received time are set server-side for hub captures.
    const { data: cap, error } = await supabase
      .from("marketing_captures")
      .insert({
        channel: "hub",
        raw_text: text.trim() || null,
        project_id: projectId,
        sector: sector as Capture["sector"],
        stage: stage as Capture["stage"],
      } as never)
      .select("id")
      .single();
    if (error || !cap) {
      setSaving(false);
      toast.error(t("add.error"));
      return;
    }
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      const path = `${cap.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const onProgress = (pct: number) => setProgress((p) => ({ ...p, [i]: pct }));
      try {
        if (f.size > TUS_THRESHOLD) await uploadResumable(path, f, onProgress);
        else {
          const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
          if (up.error) throw up.error;
          onProgress(100);
        }
      } catch { failed.push(f.name); continue; }
      const ins = await supabase.from("marketing_capture_assets").insert({
        capture_id: cap.id, storage_path: path, file_name: f.name, mime_type: f.type, size_bytes: f.size,
      });
      if (ins.error) failed.push(f.name);
    }
    setSaving(false);
    setProgress({});
    qc.invalidateQueries({ queryKey: ["marketing-captures"] });
    if (failed.length) toast.warning(t("add.failedFiles", { files: failed.join(", ") }));
    else toast.success(t("add.saved"));
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("add.title")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("add.textLabel")}</Label>
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <OptSelect label={t("add.project")} value={projectId} onChange={setProjectId} noneLabel={t("add.none")}
            options={projects.map((p) => ({ v: p.id, l: p.name }))} />
          <div className="grid grid-cols-2 gap-3">
            <OptSelect label={t("add.sector")} value={sector} onChange={setSector} noneLabel={t("add.none")}
              options={SECTORS.map((s) => ({ v: s, l: t(`sector.${s}`) }))} />
            <OptSelect label={t("add.stage")} value={stage} onChange={setStage} noneLabel={t("add.none")}
              options={STAGES.map((s) => ({ v: s, l: t(`stage.${s}`) }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("add.files")}</Label>
            <Input type="file" multiple accept="image/*,video/*,application/pdf" onChange={(e) => pickFiles(e.target.files)} />
            {files.map((f, i) => (
              <div key={i} className="space-y-1">
                <p className="truncate text-xs text-muted-foreground">{f.name}</p>
                {saving && <Progress value={progress[i] ?? 0} className="h-1.5" />}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || (!text.trim() && files.length === 0)}>
            {saving ? t("add.saving") : t("add.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IgnoredAttachmentsNote({ captureId }: { captureId: string }) {
  const { t } = useTranslation("marketing");
  const { data = [] } = useQuery({
    queryKey: ["marketing-email-ignored", captureId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("marketing_email_ignored")
        .select("id, attachment_filename, reason")
        .eq("capture_id", captureId)
        .not("attachment_filename", "is", null);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; attachment_filename: string; reason: string }>;
    },
  });
  if (data.length === 0) return null;
  const list = data
    .map((r) => `${r.attachment_filename} (${t(`ignored.reason.${r.reason}`, { defaultValue: r.reason })})`)
    .join(", ");
  return (
    <p className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
      {t("ignored.note", { count: data.length, list })}
    </p>
  );
}

function AiAnalysis({ capture, canCurate }: { capture: Capture; canCurate: boolean }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const rerun = useServerFn(reenrichCapture);
  const [busy, setBusy] = useState(false);
  const analysed = !!capture.enriched_at;
  if (!analysed && !canCurate && !capture.enrichment_error) return null;
  const run = async () => {
    setBusy(true);
    try {
      const r = await rerun({ data: { captureId: capture.id } });
      if (r.ok) toast.success(t("ai.rerunDone"));
      else toast.error(r.error ?? t("detail.error"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("detail.error"));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["marketing-captures"] });
    }
  };
  return (
    <div className="mt-6 space-y-2 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-semibold"><Sparkles className="h-4 w-4" /> {t("ai.title")}</h3>
        {canCurate && (
          <Button size="sm" variant="outline" onClick={run} disabled={busy}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", busy && "animate-spin")} /> {busy ? t("ai.running") : t("ai.rerun")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("ai.disclaimer")}</p>
      {!analysed && <p className="text-sm text-muted-foreground">{t("ai.pending")}</p>}
      {capture.fit_score != null && <Row label={t("detail.fitScore")}>{capture.fit_score}</Row>}
      {capture.ai_summary && <Row label={t("detail.aiSummary")}>{capture.ai_summary}</Row>}
      {capture.missing_notes && <Row label={t("detail.missingNotes")}>{capture.missing_notes}</Row>}
      {capture.ai_project_guess && <Row label={t("ai.projectGuess")}>{capture.ai_project_guess}</Row>}
      {capture.ai_flags?.length > 0 && (
        <Row label={t("ai.flags")}>
          <div className="flex flex-wrap gap-1">
            {capture.ai_flags.map((f) => <Badge key={f} variant="outline" className="bg-warning/15 text-warning border-warning/30">{f}</Badge>)}
          </div>
        </Row>
      )}
      {analysed && (
        <p className="text-xs text-muted-foreground">
          {t("ai.analysedWith", { version: capture.enriched_bible_version ?? "?", date: new Date(capture.enriched_at!).toLocaleString(), model: capture.enrichment_model ?? "" })}
        </p>
      )}
      {canCurate && capture.enrichment_error && <p className="text-xs text-destructive">{capture.enrichment_error}</p>}
    </div>
  );
}

function CaptureDrawer({ capture, onClose, projects, profile }: { capture: Capture | null; onClose: () => void; projects: { id: string; name: string }[]; profile: ProjectProfile | null }) {
  const { t } = useTranslation("marketing");
  const { can } = useMyPermissionsV2();
  const canCurate = can("marketing.curate", "all");
  const { data: bible } = useActiveBible();
  const qc = useQueryClient();
  const assets = capture?.marketing_capture_assets ?? [];
  const { data: urls = {} } = useSignedUrls(assets.map((a) => a.storage_path));
  const [draft, setDraft] = useState<Partial<Capture>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const { data: effClearance } = useQuery({
    queryKey: ["marketing-effective-clearance", capture?.id, capture?.clearance, profile?.clearance],
    enabled: !!capture,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("marketing_effective_clearance", { _capture_id: capture!.id });
      if (error) throw error;
      return data as Capture["clearance"];
    },
  });
  if (capture && capture.id !== lastId) { setLastId(capture.id); setDraft({}); }

  if (!capture) return null;
  const v = { ...capture, ...draft };
  const set = (patch: Partial<Capture>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("marketing_captures").update({
      project_id: v.project_id, sector: v.sector, stage: v.stage, content_type: v.content_type,
      pillar: v.pillar, persona: v.persona, shelf_life: v.shelf_life, expires_at: v.expires_at, clearance: v.clearance,
      status: v.status, curator_notes: v.curator_notes,
    }).eq("id", capture.id);
    setSaving(false);
    if (error) { toast.error(t("detail.error")); return; }
    toast.success(t("detail.saved"));
    setDraft({});
    qc.invalidateQueries({ queryKey: ["marketing-captures"] });
  };

  const none = t("add.none");
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>{t("detail.original")}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-2 text-sm">
          <Row label={t("detail.sender")}>{capture.sender_name ?? capture.sender_email ?? t("detail.unknownSender")}</Row>
          <Row label={t("detail.channel")}>{t(`channel.${capture.channel}`)}</Row>
          <Row label={t("detail.received")}>{new Date(capture.received_at).toLocaleString()}</Row>
          <p className="whitespace-pre-wrap rounded-md bg-muted p-3">{capture.raw_text}</p>
          <div className="grid grid-cols-3 gap-2">
            {assets.length === 0 && <p className="col-span-3 text-muted-foreground">{t("detail.noAssets")}</p>}
            {assets.map((a) => {
              const u = urls[a.storage_path];
              if (!u) return <div key={a.id} className="aspect-square rounded bg-muted" />;
              if (a.mime_type.startsWith("image/"))
                return <img key={a.id} src={u} alt={a.file_name} className="aspect-square cursor-zoom-in rounded object-cover" onClick={() => setLightbox(u)} />;
              if (a.mime_type.startsWith("video/"))
                return <video key={a.id} src={u} controls className="col-span-3 w-full rounded" />;
              return (
                <a key={a.id} href={u} target="_blank" rel="noreferrer" className="col-span-3 flex items-center gap-2 text-primary underline">
                  <FileText className="h-4 w-4" /> {a.file_name}
                </a>
              );
            })}
          </div>
          {canCurate && <IgnoredAttachmentsNote captureId={capture.id} />}
          {profile && (
            <div className="space-y-1 rounded-md border border-border p-2">
              {effClearance && (
                <Row label={t("profile.effectiveClearance")}>
                  <Badge variant="outline" className={CLEARANCE_CLASS[effClearance]}>{t(`clearance.${effClearance}`)}</Badge>
                  {effClearance !== capture.clearance && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("profile.projectStricter", { clearance: t(`clearance.${effClearance}`).toLowerCase() })}
                    </span>
                  )}
                </Row>
              )}
              <Link to="/marketing/projects/$profileId" params={{ profileId: profile.id }} className="text-xs text-primary underline">
                {t("profile.openProfile")}
              </Link>
            </div>
          )}
        </div>

        <AiAnalysis capture={capture} canCurate={canCurate} />

        <h3 className="mt-6 text-base font-semibold">{t("detail.curation")}</h3>
        {!canCurate && <p className="text-xs text-muted-foreground">{t("detail.readOnly")}</p>}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <OptSelect label={t("detail.project")} value={v.project_id} onChange={(x) => set({ project_id: x })} disabled={!canCurate} noneLabel={none}
              options={projects.map((p) => ({ v: p.id, l: p.name }))} />
          </div>
          <OptSelect label={t("detail.sector")} value={v.sector} onChange={(x) => set({ sector: x as Capture["sector"] })} disabled={!canCurate} noneLabel={none}
            options={SECTORS.map((s) => ({ v: s, l: t(`sector.${s}`) }))} />
          <OptSelect label={t("detail.stage")} value={v.stage} onChange={(x) => set({ stage: x as Capture["stage"] })} disabled={!canCurate} noneLabel={none}
            options={STAGES.map((s) => ({ v: s, l: t(`stage.${s}`) }))} />
          <OptSelect label={t("detail.contentType")} value={v.content_type} onChange={(x) => set({ content_type: x as Capture["content_type"] })} disabled={!canCurate} noneLabel={none}
            options={CONTENT_TYPES.map((s) => ({ v: s, l: t(`contentType.${s}`) }))} />
          <BibleKeySelect label={t("detail.pillar")} value={v.pillar} disabled={!canCurate || !bible} noneLabel={none}
            items={bible?.pillars ?? []} unknownKey="detail.unknownPillar" onChange={(x) => set({ pillar: x })} hint={!bible ? t("detail.noBible") : undefined} />
          <BibleKeySelect label={t("detail.persona")} value={v.persona} disabled={!canCurate || !bible} noneLabel={none}
            items={bible?.personas ?? []} unknownKey="detail.unknownPersona" onChange={(x) => set({ persona: x })} hint={!bible ? t("detail.noBible") : undefined} />
          <OptSelect label={t("detail.shelfLife")} value={v.shelf_life} onChange={(x) => set({ shelf_life: x as Capture["shelf_life"] })} disabled={!canCurate} noneLabel={none}
            options={SHELF.map((s) => ({ v: s, l: t(`shelfLife.${s}`) }))} />
          <div className="space-y-1">
            <Label className="text-xs">{t("detail.expiresAt")}</Label>
            <Input type="date" value={v.expires_at?.slice(0, 10) ?? ""} disabled={!canCurate}
              onChange={(e) => set({ expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("detail.clearance")}</Label>
            <Select value={v.clearance} onValueChange={(x) => set({ clearance: x as Capture["clearance"] })} disabled={!canCurate}>
              <SelectTrigger className={cn("border", CLEARANCE_CLASS[v.clearance])}><SelectValue /></SelectTrigger>
              <SelectContent>{CLEARANCES.map((s) => <SelectItem key={s} value={s}>{t(`clearance.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("detail.status")}</Label>
            <Select value={v.status} onValueChange={(x) => set({ status: x as Capture["status"] })} disabled={!canCurate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">{t("detail.curatorNotes")}</Label>
            <Textarea rows={3} value={v.curator_notes ?? ""} disabled={!canCurate} onChange={(e) => set({ curator_notes: e.target.value || null })} />
          </div>
        </div>
        {canCurate && (
          <Button className="mt-4" onClick={save} disabled={saving || Object.keys(draft).length === 0}>{t("detail.save")}</Button>
        )}

        <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
          <DialogContent className="max-w-5xl p-2">
            <DialogHeader className="sr-only"><DialogTitle>{t("detail.assets")}</DialogTitle></DialogHeader>
            {lightbox && <img src={lightbox} alt="" className="max-h-[85vh] w-full object-contain" />}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function BibleKeySelect({ label, value, items, disabled, noneLabel, unknownKey, hint, onChange }: {
  label: string; value: string | null; items: { key: string; name: string }[]; disabled: boolean;
  noneLabel: string; unknownKey: string; hint?: string; onChange: (v: string | null) => void;
}) {
  const { t } = useTranslation("marketing");
  const known = !value || items.some((i) => i.key === value);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? NONE} onValueChange={(x) => onChange(x === NONE ? null : x)} disabled={disabled}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{noneLabel}</SelectItem>
          {!known && value && <SelectItem value={value}>{t(unknownKey, { key: value })}</SelectItem>}
          {items.map((i) => <SelectItem key={i.key} value={i.key}>{i.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
