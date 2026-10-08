import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Check, Copy, GripVertical, ImagePlus, Loader2, Mic, Pencil, Send, Sparkles, Square, Trash2, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { V2PermissionGate } from "@/components/PermissionGate";
import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NudgePanel } from "@/components/marketing/nudge-panel";
import { VoiceLevelMeter } from "@/components/marketing/voice-level-meter";
import { useVoiceRecorder } from "@/components/marketing/use-voice-recorder";
import { blobToBase64 } from "@/lib/projects/wav-encoder";
import { resolveDraftImages } from "@/lib/marketing/draft-images";
import {
  addCompositionComment, deleteCompositionComment, duplicateComposition, listCompositionComments, writeComposedPost,
} from "@/lib/marketing/compositions.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/marketing/carousels/$id")({
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="all">
      <CarouselPage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Carousel composer — Portal Pedra Silva" },
      { name: "description", content: "Compose a carousel by hand: photos, text slides and team comments, then let the AI write the post." },
      { property: "og:title", content: "Carousel composer — Portal Pedra Silva" },
      { property: "og:description", content: "Compose a carousel by hand: photos, text slides and team comments, then let the AI write the post." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const BUCKET = "marketing-assets";
const MAX_SLIDES = 20;
const MAX_REC_SECONDS = 600;

type Comp = { id: string; profile_id: string; title: string; intent: string | null; status: "draft" | "sent"; idea_id: string | null; marketing_project_profiles: { project_id: string; pm_projects: { name: string } | null } | null };
type Slide = { id: string; position: number; kind: "image" | "text"; media_id: string | null; capture_asset_id: string | null; text_heading: string | null; text_body: string | null; design_media_id: string | null };
const slideAsset = (s: Slide) => (s.kind === "text" ? s.design_media_id : s.media_id ?? s.capture_asset_id);
const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);

function imgSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => res(null);
    i.src = src;
  });
}

function CarouselPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = useMyPermissionsV2();
  const canCurate = can("marketing.curate", "all");
  const writeFn = useServerFn(writeComposedPost);
  const dupFn = useServerFn(duplicateComposition);
  const compKey = ["marketing-composition", id];
  const slidesKey = ["marketing-composition-slides", id];

  const { data: comp, isLoading } = useQuery({
    queryKey: compKey,
    queryFn: async () => {
      const { data, error } = await db.from("marketing_compositions").select("*, marketing_project_profiles(project_id, pm_projects(name))").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Comp | null;
    },
  });
  const { data: canEditRaw = false } = useQuery({
    queryKey: ["marketing-composition-can-edit", id, user?.id],
    enabled: !!user,
    queryFn: async () => (await db.rpc("marketing_can_edit_composition", { _user_id: user!.id, _composition_id: id })).data === true,
  });
  const editable = canEditRaw && comp?.status === "draft";
  const { data: slides = [] } = useQuery({
    queryKey: slidesKey,
    queryFn: async () => {
      const { data, error } = await db.from("marketing_composition_slides").select("*").eq("composition_id", id).order("position");
      if (error) throw error;
      return (data ?? []) as Slide[];
    },
  });
  const assetIds = slides.map(slideAsset).filter((x): x is string => !!x);
  const { data: images = {} } = useQuery({
    queryKey: ["marketing-composition-images", assetIds],
    enabled: assetIds.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const list = await resolveDraftImages(db, assetIds);
      const m: Record<string, { url: string | null; caption: string | null }> = {};
      for (const x of list) m[x.id] = { url: x.url, caption: x.caption };
      return m;
    },
  });
  const { data: sentRequest } = useQuery({
    queryKey: ["marketing-composition-request", comp?.idea_id],
    enabled: !!comp?.idea_id,
    queryFn: async () => {
      const { data } = await db.from("marketing_post_drafts").select("request_id").eq("idea_id", comp!.idea_id).limit(1).maybeSingle();
      return (data?.request_id as string | undefined) ?? null;
    },
  });

  const [order, setOrder] = useState<Slide[]>([]);
  useEffect(() => { setOrder(slides); }, [slides]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [textDialog, setTextDialog] = useState<{ at: number; slide?: Slide } | null>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("");
  useEffect(() => { if (comp) { setTitle(comp.title); setIntent(comp.intent ?? ""); } }, [comp?.id, comp?.title, comp?.intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSlides = () => qc.invalidateQueries({ queryKey: slidesKey });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const renumber = async (list: Slide[]) => {
    const changed = list.map((s, i) => ({ s, i })).filter(({ s, i }) => s.position !== i);
    const results = await Promise.all(changed.map(({ s, i }) => db.from("marketing_composition_slides").update({ position: i }).eq("id", s.id)));
    if (results.some((r: { error: unknown }) => r.error)) toast.error(t("carousel.saveError"));
    refreshSlides();
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.findIndex((s) => s.id === e.active.id);
    const to = order.findIndex((s) => s.id === e.over!.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    void renumber(next);
  };

  const saveHeader = async () => {
    if (!comp || !editable) return;
    if (!title.trim()) { setTitle(comp.title); return; }
    if (title.trim() === comp.title && (intent.trim() || null) === (comp.intent ?? null)) return;
    const { error } = await db.from("marketing_compositions").update({ title: title.trim(), intent: intent.trim() || null }).eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: compKey });
  };

  const removeSlide = async (s: Slide) => {
    const { error } = await db.from("marketing_composition_slides").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    if (selected === s.id) setSelected(null);
    await renumber(order.filter((x) => x.id !== s.id));
  };

  const addImages = async (picked: { media_id?: string; capture_asset_id?: string }[]) => {
    if (order.length + picked.length > MAX_SLIDES) { toast.error(t("carousel.tooMany", { max: MAX_SLIDES })); return; }
    const base = order.length;
    const { error } = await db.from("marketing_composition_slides").insert(picked.map((p, i) => ({
      composition_id: id, position: base + i, kind: "image", media_id: p.media_id ?? null, capture_asset_id: p.capture_asset_id ?? null,
    })));
    if (error) toast.error(error.message);
    setPickerOpen(false);
    refreshSlides();
  };

  const saveText = async (heading: string, body: string) => {
    if (!textDialog) return;
    if (textDialog.slide) {
      const { error } = await db.from("marketing_composition_slides").update({ text_heading: heading, text_body: body || null }).eq("id", textDialog.slide.id);
      if (error) toast.error(error.message);
      setTextDialog(null); refreshSlides(); return;
    }
    if (order.length >= MAX_SLIDES) { toast.error(t("carousel.tooMany", { max: MAX_SLIDES })); return; }
    const { data: row, error } = await db.from("marketing_composition_slides").insert({
      composition_id: id, position: order.length + 100, kind: "text", text_heading: heading, text_body: body || null,
    }).select("*").single();
    if (error || !row) { toast.error(error?.message ?? t("carousel.saveError")); return; }
    const next = [...order];
    next.splice(textDialog.at, 0, row as Slide);
    setTextDialog(null);
    setOrder(next);
    await renumber(next);
  };

  const uploadDesign = async (s: Slide, file: File) => {
    if (!comp) return;
    if (!file.type.startsWith("image/")) { toast.error(t("carousel.imageOnly")); return; }
    const path = `library/${comp.profile_id}/text-slides/${crypto.randomUUID()}-${safe(file.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) { toast.error(up.error.message); return; }
    const { data: m, error } = await db.from("marketing_project_media").insert({
      profile_id: comp.profile_id, storage_path: path, file_name: file.name, mime_type: file.type, kind: "text_slide",
      caption: s.text_heading, caption_status: "confirmed", credit: null,
    }).select("id").single();
    if (error || !m) { await supabase.storage.from(BUCKET).remove([path]); toast.error(error?.message ?? t("carousel.saveError")); return; }
    const { error: uErr } = await db.from("marketing_composition_slides").update({ design_media_id: m.id }).eq("id", s.id);
    if (uErr) { toast.error(uErr.message); return; }
    toast.success(t("carousel.designSaved"));
    // Warn (don't block) when the design's shape differs from the cover.
    const first = order[0];
    const firstUrl = first && first.id !== s.id ? images[slideAsset(first) ?? ""]?.url : null;
    if (firstUrl) {
      const local = URL.createObjectURL(file);
      const [a, b] = await Promise.all([imgSize(local), imgSize(firstUrl)]);
      URL.revokeObjectURL(local);
      if (a && b && Math.abs(a.w / a.h - b.w / b.h) > 0.02) toast.warning(t("carousel.aspectWarning"));
    }
    refreshSlides();
  };

  const pendingDesigns = order.filter((s) => s.kind === "text" && !s.design_media_id).length;
  const write = async () => {
    setWriting(true);
    try {
      const r = await writeFn({ data: { compositionId: id } });
      toast.success(t("carousel.sent"));
      qc.invalidateQueries({ queryKey: compKey });
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
      navigate({ to: "/marketing/posts", search: { request: r.requestId } });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setWriting(false); }
  };
  const duplicate = async () => {
    if (!comp) return;
    try {
      const r = await dupFn({ data: { compositionId: id, title: t("carousel.copyTitle", { title: comp.title }) } });
      toast.success(t("carousel.duplicated"));
      navigate({ to: "/marketing/carousels/$id", params: { id: r.id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  if (isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!comp) return <div className="p-6 text-sm text-muted-foreground">{t("carousel.notFound")}</div>;
  const projectName = comp.marketing_project_profiles?.pm_projects?.name ?? "—";
  const slideNo = new Map(order.map((s, i) => [s.id, i + 1]));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <ModuleSubnav moduleId="marketing" />
      <Link to="/marketing/projects/$profileId" params={{ profileId: comp.profile_id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" />{projectName}
      </Link>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={comp.status === "sent" ? "default" : "outline"}>{t(`carousel.status.${comp.status}`)}</Badge>
          <span className="text-sm text-muted-foreground">{t("carousel.project")}: {projectName}</span>
          {comp.status === "sent" && sentRequest && (
            <Link to="/marketing/posts" search={{ request: sentRequest }} className="text-sm text-primary hover:underline">{t("carousel.openIdea")}</Link>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {canEditRaw && <Button size="sm" variant="outline" onClick={duplicate}><Copy className="mr-1 h-3.5 w-3.5" />{t("carousel.duplicate")}</Button>}
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t("carousel.titleLabel")}</Label>
          <Input value={title} maxLength={200} disabled={!editable} onChange={(e) => setTitle(e.target.value)} onBlur={saveHeader} />
        </div>
        <div className="space-y-1">
          <Label>{t("carousel.intent")}</Label>
          <Textarea rows={3} value={intent} maxLength={4000} disabled={!editable} onChange={(e) => setIntent(e.target.value)} onBlur={saveHeader}
            placeholder={t("carousel.intentHint")} className="field-sizing-content min-h-20" />
        </div>
        {comp.status === "sent" && <p className="text-xs text-muted-foreground">{t("carousel.readOnly")}</p>}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{t("carousel.slides")}</h2>
          <span className="text-xs text-muted-foreground">{order.length}/{MAX_SLIDES}</span>
          {editable && (
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} disabled={order.length >= MAX_SLIDES}><ImagePlus className="mr-1 h-3.5 w-3.5" />{t("carousel.addPhotos")}</Button>
              <Button size="sm" variant="outline" onClick={() => setTextDialog({ at: order.length })} disabled={order.length >= MAX_SLIDES}><Type className="mr-1 h-3.5 w-3.5" />{t("carousel.textSlide")}</Button>
            </div>
          )}
        </div>
        {!order.length && <p className="text-sm text-muted-foreground">{t("carousel.noSlides")}</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex items-start gap-1 overflow-x-auto pb-2">
              {order.map((s, i) => (
                <div key={s.id} className="flex items-start">
                  {editable && i > 0 && (
                    <button type="button" className="mx-0.5 mt-16 rounded border border-dashed border-border px-1 text-xs text-muted-foreground hover:bg-muted"
                      title={t("carousel.insertText")} aria-label={t("carousel.insertText")} onClick={() => setTextDialog({ at: i })}>+T</button>
                  )}
                  <SlideCard slide={s} index={i} url={images[slideAsset(s) ?? ""]?.url ?? null} caption={images[slideAsset(s) ?? ""]?.caption ?? null}
                    editable={editable} selected={selected === s.id} onSelect={() => setSelected(selected === s.id ? null : s.id)}
                    onRemove={() => removeSlide(s)} onEditText={() => setTextDialog({ at: i, slide: s })} onUpload={(f) => uploadDesign(s, f)} />
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {canCurate && comp.status === "draft" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button onClick={write} disabled={writing || pendingDesigns > 0 || order.length < 2}>
              {writing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}{t("carousel.write")}
            </Button>
            {pendingDesigns > 0 && <span className="text-sm text-muted-foreground">{t("carousel.pendingDesigns", { count: pendingDesigns })}</span>}
            {writing && <span className="text-sm text-muted-foreground">{t("carousel.writing")}</span>}
          </div>
        )}
      </Card>

      <CommentsPanel compositionId={id} selected={selected} slideNo={slideNo} onClearSlide={() => setSelected(null)} canCurate={canCurate} />

      {canCurate && comp.marketing_project_profiles && (
        <Card className="p-4">
          <NudgePanel compositionId={id} projectId={comp.marketing_project_profiles.project_id} hasProfile
            onSent={() => qc.invalidateQueries({ queryKey: ["marketing-composition-comments", id] })} />
        </Card>
      )}

      {pickerOpen && <PhotoPicker profileId={comp.profile_id} projectId={comp.marketing_project_profiles?.project_id ?? null}
        inUse={new Set(order.map((s) => s.media_id ?? s.capture_asset_id).filter((x): x is string => !!x))}
        room={MAX_SLIDES - order.length} onClose={() => setPickerOpen(false)} onAdd={addImages} />}
      {textDialog && <TextSlideDialog initial={textDialog.slide} onClose={() => setTextDialog(null)} onSave={saveText} />}
    </div>
  );
}

function SlideCard({ slide, index, url, caption, editable, selected, onSelect, onRemove, onEditText, onUpload }: {
  slide: Slide; index: number; url: string | null; caption: string | null; editable: boolean; selected: boolean;
  onSelect: () => void; onRemove: () => void; onEditText: () => void; onUpload: (f: File) => void;
}) {
  const { t } = useTranslation("marketing");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id, disabled: !editable });
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = slide.kind === "text" && !slide.design_media_id;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("w-40 shrink-0 space-y-1 rounded-md border bg-card p-1.5", selected ? "border-primary ring-2 ring-primary/40" : "border-border", isDragging && "opacity-60")}>
      <div className="flex items-center gap-1 text-xs">
        {editable && <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground" aria-label={t("carousel.drag")}><GripVertical className="h-3.5 w-3.5" /></span>}
        <span className="font-semibold">{index + 1}</span>
        {index === 0 && <Badge variant="secondary" className="px-1 py-0 text-[10px]">{t("carousel.cover")}</Badge>}
        {editable && <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label={t("carousel.remove")}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      <button type="button" onClick={onSelect} className="block w-full text-left" aria-pressed={selected}>
        {slide.kind === "text" && pending ? (
          <div className="flex aspect-[4/5] flex-col justify-center gap-1 rounded bg-muted p-2">
            <p className="text-sm font-semibold leading-tight">{slide.text_heading}</p>
            {slide.text_body && <p className="text-xs text-muted-foreground">{slide.text_body}</p>}
          </div>
        ) : url ? (
          <img src={url} alt={caption ?? slide.text_heading ?? ""} className="aspect-[4/5] w-full rounded object-cover" loading="lazy" />
        ) : (
          <div className="aspect-[4/5] w-full rounded bg-muted" />
        )}
      </button>
      {slide.kind === "text" && (
        <div className="space-y-1">
          {pending ? <Badge variant="outline" className="border-amber-500 text-[10px] text-amber-700 dark:text-amber-400">{t("carousel.designPending")}</Badge>
            : <p className="truncate text-[11px] text-muted-foreground">{slide.text_heading}</p>}
          {editable && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 px-1 text-[11px]" onClick={() => fileRef.current?.click()}><Upload className="mr-0.5 h-3 w-3" />{slide.design_media_id ? t("carousel.replaceDesign") : t("carousel.uploadDesign")}</Button>
              <Button size="sm" variant="ghost" className="h-6 px-1" onClick={onEditText} aria-label={t("carousel.editText")}><Pencil className="h-3 w-3" /></Button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }} />
            </div>
          )}
        </div>
      )}
      {slide.kind === "image" && caption && <p className="line-clamp-2 text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}

function TextSlideDialog({ initial, onClose, onSave }: { initial?: Slide; onClose: () => void; onSave: (h: string, b: string) => void }) {
  const { t } = useTranslation("marketing");
  const [heading, setHeading] = useState(initial?.text_heading ?? "");
  const [body, setBody] = useState(initial?.text_body ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("carousel.textSlide")}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">{t("carousel.textSlideHint")}</p>
        <div className="space-y-1">
          <Label>{t("carousel.heading")}</Label>
          <Input value={heading} maxLength={120} onChange={(e) => setHeading(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t("carousel.line")}</Label>
          <Textarea rows={2} value={body} maxLength={300} onChange={(e) => setBody(e.target.value)} />
        </div>
        <DialogFooter><Button onClick={() => onSave(heading.trim(), body.trim())} disabled={!heading.trim()}>{t("detail.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PickItem = { key: string; media_id?: string; capture_asset_id?: string; storage_path: string; caption: string | null };

function PhotoPicker({ profileId, projectId, inUse, room, onClose, onAdd }: {
  profileId: string; projectId: string | null; inUse: Set<string>; room: number; onClose: () => void;
  onAdd: (p: { media_id?: string; capture_asset_id?: string }[]) => void;
}) {
  const { t } = useTranslation("marketing");
  const [sel, setSel] = useState<string[]>([]);
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-composition-picker", profileId, projectId],
    queryFn: async () => {
      const [{ data: media }, { data: caps }] = await Promise.all([
        db.from("marketing_project_media").select("id, storage_path, caption, mime_type, kind, position, created_at")
          .eq("profile_id", profileId).eq("caption_status", "confirmed").neq("kind", "text_slide")
          .order("position", { ascending: true, nullsFirst: false }).order("created_at"),
        projectId ? db.from("marketing_captures").select("id, ai_summary, marketing_capture_assets(id, storage_path, mime_type, position, created_at)")
          .eq("project_id", projectId).order("received_at", { ascending: false }) : { data: [] },
      ]);
      const library: PickItem[] = ((media ?? []) as { id: string; storage_path: string; caption: string | null; mime_type: string }[])
        .filter((m) => m.mime_type.startsWith("image/")).map((m) => ({ key: m.id, media_id: m.id, storage_path: m.storage_path, caption: m.caption }));
      const inbox: PickItem[] = [];
      for (const c of (caps ?? []) as { id: string; ai_summary: string | null; marketing_capture_assets: { id: string; storage_path: string; mime_type: string }[] }[]) {
        for (const a of c.marketing_capture_assets) if (a.mime_type.startsWith("image/")) inbox.push({ key: a.id, capture_asset_id: a.id, storage_path: a.storage_path, caption: c.ai_summary });
      }
      const paths = [...library, ...inbox].map((x) => x.storage_path);
      const urls: Record<string, string> = {};
      if (paths.length) {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
        for (const d of s ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
      }
      return { library, inbox, urls };
    },
  });
  const all = useMemo(() => new Map([...(data?.library ?? []), ...(data?.inbox ?? [])].map((x) => [x.key, x])), [data]);
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= room ? s : [...s, k]));
  const grid = (items: PickItem[]) => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {items.map((x) => {
        const used = inUse.has(x.key);
        const n = sel.indexOf(x.key);
        return (
          <button key={x.key} type="button" onClick={() => toggle(x.key)} className={cn("relative space-y-1 rounded border p-1 text-left", n >= 0 ? "border-primary ring-2 ring-primary/40" : "border-border")}>
            {data?.urls[x.storage_path] ? <img src={data.urls[x.storage_path]} alt={x.caption ?? ""} className="aspect-square w-full rounded object-cover" loading="lazy" /> : <div className="aspect-square rounded bg-muted" />}
            {n >= 0 && <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{n + 1}</span>}
            {used && <Badge variant="secondary" className="absolute left-1 top-1 px-1 py-0 text-[10px]"><Check className="mr-0.5 h-3 w-3" />{t("carousel.inCarousel")}</Badge>}
            {x.caption && <p className="line-clamp-2 text-[11px] text-muted-foreground">{x.caption}</p>}
          </button>
        );
      })}
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>{t("carousel.addPhotos")}</DialogTitle></DialogHeader>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        <h3 className="text-sm font-semibold">{t("carousel.fromLibrary")}</h3>
        {data && !data.library.length && <p className="text-xs text-muted-foreground">{t("carousel.noLibrary")}</p>}
        {data && grid(data.library)}
        <h3 className="text-sm font-semibold">{t("carousel.fromInbox")}</h3>
        {data && !data.inbox.length && <p className="text-xs text-muted-foreground">{t("carousel.noInbox")}</p>}
        {data && grid(data.inbox)}
        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">{t("carousel.selected", { count: sel.length, room })}</span>
          <Button onClick={() => onAdd(sel.map((k) => all.get(k)!).map((x) => ({ media_id: x.media_id, capture_asset_id: x.capture_asset_id })))} disabled={!sel.length}>
            {t("carousel.addSelected")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommentsPanel({ compositionId, selected, slideNo, onClearSlide, canCurate }: {
  compositionId: string; selected: string | null; slideNo: Map<string, number>; onClearSlide: () => void; canCurate: boolean;
}) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const listFn = useServerFn(listCompositionComments);
  const addFn = useServerFn(addCompositionComment);
  const delFn = useServerFn(deleteCompositionComment);
  const rec = useVoiceRecorder("marketing-carousel-comment");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const key = ["marketing-composition-comments", compositionId];
  const { data } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { compositionId } }), refetchOnWindowFocus: true });
  const comments = (data?.comments ?? []).filter((c) => !selected || c.slide_id === selected);

  const submit = async (payload: { text?: string; audioBase64?: string; mime?: string }) => {
    setBusy(true);
    try {
      await addFn({ data: { compositionId, slideId: selected, ...payload } });
      setText("");
      qc.invalidateQueries({ queryKey: key });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    const wav = await rec.stop();
    if (wav) await submit({ text: text.trim() || undefined, audioBase64: await blobToBase64(wav), mime: "audio/wav" });
  };
  useEffect(() => {
    if (!rec.recording) { setSeconds(0); return; }
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [rec.recording]);
  useEffect(() => { if (rec.recording && seconds >= MAX_REC_SECONDS) void stop(); }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleRec = async () => {
    if (rec.recording) return stop();
    try { await rec.start(); } catch { /* the recorder toasts its own errors */ }
  };
  const remove = async (id: string) => {
    try { await delFn({ data: { commentId: id } }); qc.invalidateQueries({ queryKey: key }); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{t("carousel.comments")}</h2>
        {selected ? (
          <Badge variant="secondary" className="cursor-pointer" onClick={onClearSlide}>{t("carousel.aboutSlide", { n: slideNo.get(selected) ?? "?" })} ×</Badge>
        ) : <span className="text-xs text-muted-foreground">{t("carousel.commentsHint")}</span>}
      </div>
      <div className="space-y-2">
        {!comments.length && <p className="text-sm text-muted-foreground">{t("carousel.noComments")}</p>}
        {comments.map((c) => (
          <div key={c.id} className="space-y-1 rounded border border-border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{c.authorName}</span>
              <span>{new Date(c.created_at).toLocaleString()}</span>
              <Badge variant="outline" className="px-1 py-0 text-[10px]">{c.slide_id ? t("carousel.aboutSlide", { n: slideNo.get(c.slide_id) ?? "?" }) : t("carousel.aboutAll")}</Badge>
              {c.fromQuestion && <Badge variant="outline" className="px-1 py-0 text-[10px]">{t("carousel.fromQuestion")}</Badge>}
              {(c.mine || canCurate) && <button type="button" className="ml-auto hover:text-destructive" onClick={() => remove(c.id)} aria-label={t("carousel.deleteComment")}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {c.audioUrl && <audio controls src={c.audioUrl} className="h-8 w-full" />}
            <p className="whitespace-pre-wrap">{c.text}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Textarea rows={2} value={text} maxLength={8000} onChange={(e) => setText(e.target.value)}
          placeholder={selected ? t("carousel.commentSlidePlaceholder", { n: slideNo.get(selected) ?? "?" }) : t("carousel.commentPlaceholder")} />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => submit({ text: text.trim() })} disabled={busy || rec.recording || !text.trim()}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}{t("carousel.addComment")}
          </Button>
          <Button size="sm" variant={rec.recording ? "destructive" : "outline"} onClick={toggleRec} disabled={busy || rec.starting}>
            {rec.recording ? <Square className="mr-1 h-3.5 w-3.5" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
            {rec.recording ? t("carousel.stopRecording", { s: seconds }) : t("carousel.record")}
          </Button>
          {rec.recording && <VoiceLevelMeter level={rec.level} />}
          {busy && <span className="text-xs text-muted-foreground">{t("carousel.transcribing")}</span>}
        </div>
      </div>
    </Card>
  );
}
