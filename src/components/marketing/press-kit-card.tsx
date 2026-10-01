import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, GripVertical, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteMedia, processPressKit } from "@/lib/marketing/presskit.functions";
import { extractDocxText, extractPdfText } from "@/lib/marketing/extract-text";
import type { Clearance } from "@/lib/marketing/projects";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const BUCKET = "marketing-assets";
const MAX = 50 * 1024 * 1024;
const OK_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
const KINDS = ["photo", "diagram", "drawing"] as const;
type Kind = (typeof KINDS)[number];
type Media = {
  id: string; press_kit_id: string | null; storage_path: string; file_name: string; mime_type: string; kind: Kind;
  caption_ai: string | null; caption: string | null; caption_status: "pending" | "ai_draft" | "confirmed";
  credit: string | null; position: number | null; last_used_at: string | null; created_at: string;
};
type Kit = { id: string; title: string | null; press_text: string; processed_at: string | null; process_error: string | null; created_at: string };

const safe = (n: string) => n.replace(/[^\w.\-]+/g, "_");
const mimeOf = (f: File) => f.type || (/\.hei[cf]$/i.test(f.name) ? "image/heic" : "application/octet-stream");

export function PressKitCard({ profileId, canEdit, canCurate, clearance, onCleared }: {
  profileId: string; canEdit: boolean; canCurate: boolean; clearance: Clearance; onCleared: () => void;
}) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const runKit = useServerFn(processPressKit);
  const removeMedia = useServerFn(deleteMedia);
  const kitsKey = ["marketing-press-kits", profileId];
  const mediaKey = ["marketing-project-media", profileId];

  const { data: kits = [] } = useQuery({
    queryKey: kitsKey,
    queryFn: async () => {
      const { data, error } = await db.from("marketing_project_press_kits").select("id, title, press_text, processed_at, process_error, created_at")
        .eq("profile_id", profileId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Kit[];
    },
  });
  const { data: media = [] } = useQuery({
    queryKey: mediaKey,
    queryFn: async () => {
      const { data, error } = await db.from("marketing_project_media").select("*").eq("profile_id", profileId)
        .order("position", { ascending: true, nullsFirst: false }).order("created_at");
      if (error) throw error;
      return (data ?? []) as Media[];
    },
  });
  const paths = media.map((m) => m.storage_path);
  const { data: urls = {} } = useQuery({
    queryKey: ["marketing-library-urls", paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      const m: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      return m;
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: kitsKey }); qc.invalidateQueries({ queryKey: mediaKey }); qc.invalidateQueries({ queryKey: ["marketing-story-suggestions", profileId] }); };

  // ── New kit form ──
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [credit, setCredit] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);

  const pickSource = async (f: File | null) => {
    setSrcFile(f);
    if (!f) return;
    setExtracting(true);
    try {
      const out = /\.pdf$/i.test(f.name) ? await extractPdfText(f) : /\.docx$/i.test(f.name) ? await extractDocxText(f) : "";
      if (!out.trim()) throw new Error("empty");
      setText(out);
    } catch { toast.error(t("pressKit.extractFailed")); }
    setExtracting(false);
  };
  const pickImages = (list: FileList | null) => {
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!OK_EXT.includes(ext)) { toast.error(`${f.name}: ${t("pressKit.exportAs")}`); continue; }
      if (f.size > MAX) { toast.error(`${f.name}: ${t("pressKit.tooBig")}`); continue; }
      ok.push(f);
    }
    setFiles((prev) => [...prev, ...ok]);
  };

  const save = async () => {
    if (!text.trim()) { toast.error(t("pressKit.textRequired")); return; }
    setSaving(true);
    let sourcePath: string | null = null;
    if (srcFile) {
      const path = `library/${profileId}/kits/${crypto.randomUUID()}-${safe(srcFile.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, srcFile, { contentType: srcFile.type || undefined });
      if (!up.error) sourcePath = path;
    }
    const { data: kit, error } = await db.from("marketing_project_press_kits")
      .insert({ profile_id: profileId, title: title.trim() || null, press_text: text.trim(), source_file_path: sourcePath }).select("id").single();
    if (error || !kit) { setSaving(false); toast.error(t("profiles.error")); return; }
    const start = media.reduce((m, x) => Math.max(m, x.position ?? 0), 0) + 1;
    const failed: string[] = [];
    setProgress({ done: 0, total: files.length });
    for (const [i, f] of files.entries()) {
      const path = `library/${profileId}/${crypto.randomUUID()}-${safe(f.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: mimeOf(f) });
      if (up.error) { failed.push(f.name); continue; }
      const ins = await db.from("marketing_project_media").insert({
        profile_id: profileId, press_kit_id: kit.id, storage_path: path, file_name: f.name, mime_type: mimeOf(f),
        credit: credit.trim() || null, position: start + i,
      });
      if (ins.error) failed.push(f.name);
      setProgress({ done: i + 1, total: files.length });
    }
    setSaving(false); setProgress(null);
    if (failed.length) toast.warning(t("add.failedFiles", { files: failed.join(", ") }));
    setOpen(false); setTitle(""); setText(""); setSrcFile(null); setFiles([]); setCredit("");
    refresh();
    setProcessing(true);
    try {
      const r = await runKit({ data: { kitId: kit.id } });
      toast.success(t("pressKit.processed", { suggestions: r.suggestions, captions: r.captioned }));
      if (r.errors.length) toast.warning(t("pressKit.processPartial"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("profiles.error")); }
    setProcessing(false);
    refresh();
  };

  // ── Media edits ──
  const [edits, setEdits] = useState<Record<string, Partial<Media>>>({});
  const val = (m: Media) => ({ ...m, ...edits[m.id] });
  const setEdit = (id: string, patch: Partial<Media>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("marketing_project_media").update(patch).eq("id", id);
    if (error) { toast.error(t("profiles.error")); return false; }
    return true;
  };
  const confirm = async (m: Media) => {
    const v = val(m);
    if (await update(m.id, { caption: v.caption?.trim() || null, credit: v.credit?.trim() || null, kind: v.kind, caption_status: "confirmed" })) {
      setEdits((e) => { const n = { ...e }; delete n[m.id]; return n; });
      qc.invalidateQueries({ queryKey: mediaKey });
    }
  };
  const confirmAll = async () => {
    for (const m of media) if (m.caption_status !== "confirmed" && (val(m).caption ?? "").trim()) await confirm(m);
    toast.success(t("pressKit.confirmedAll"));
  };
  const remove = async (m: Media) => {
    if (!window.confirm(t("pressKit.deleteConfirm"))) return;
    const r = await removeMedia({ data: { mediaId: m.id } });
    if (r.ok) { toast.success(t("pressKit.deleted")); qc.invalidateQueries({ queryKey: mediaKey }); return; }
    if (r.reason === "published") toast.error(t("pressKit.deletePublished"));
    else if (r.reason === "drafts") toast.error(t("pressKit.deleteDrafts", { count: r.count ?? 0 }));
    else toast.error(t("profiles.error"));
  };
  const [dragId, setDragId] = useState<string | null>(null);
  const drop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = media.map((m) => m.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    setDragId(null);
    await Promise.all(ids.map((id, i) => db.from("marketing_project_media").update({ position: i + 1 }).eq("id", id)));
    qc.invalidateQueries({ queryKey: mediaKey });
  };
  const markCleared = async () => {
    const { error } = await db.from("marketing_project_profiles").update({ clearance: "cleared" }).eq("id", profileId);
    if (error) { toast.error(t("profiles.error")); return; }
    toast.success(t("detail.saved"));
    onCleared();
  };

  if (!canEdit && kits.length === 0 && media.length === 0) return null;
  const unconfirmed = media.filter((m) => m.caption_status !== "confirmed").length;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t("pressKit.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("pressKit.hint")}</p>
        </div>
        {canEdit && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("pressKit.add")}</Button>}
      </div>

      {canCurate && kits.length > 0 && clearance !== "cleared" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          <span>{t("pressKit.clearBanner")}</span>
          <Button size="sm" onClick={markCleared}>{t("pressKit.clearAction")}</Button>
        </div>
      )}

      {processing && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("pressKit.processing")}</p>}

      {open && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1"><Label className="text-xs">{t("pressKit.kitTitle")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs">{t("pressKit.pressText")}</Label>
            <Input type="file" accept=".docx,.pdf" onChange={(e) => pickSource(e.target.files?.[0] ?? null)} />
            {extracting && <p className="text-xs text-muted-foreground">{t("pressKit.extracting")}</p>}
            <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("pressKit.pastePlaceholder")} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("pressKit.images")}</Label>
            <Input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => { pickImages(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && <p className="text-xs text-muted-foreground">{t("pressKit.selected", { count: files.length })}</p>}
          </div>
          <div className="space-y-1"><Label className="text-xs">{t("pressKit.credit")}</Label><Input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder={t("pressKit.creditPlaceholder")} /></div>
          {progress && <p className="text-xs text-muted-foreground">{t("pressKit.uploading", { done: progress.done, total: progress.total })}</p>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || extracting}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("detail.save")}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>{t("posts.cancel")}</Button>
          </div>
        </div>
      )}

      {kits.map((k) => (
        <details key={k.id} className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{k.title || t("pressKit.untitled")} <span className="text-xs text-muted-foreground">· {new Date(k.created_at).toLocaleDateString()}</span></summary>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{k.press_text}</p>
          {k.process_error && canEdit && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-destructive">{t("pressKit.processPartial")}</span>
              <Button size="sm" variant="outline" disabled={processing} onClick={async () => {
                setProcessing(true);
                try { await runKit({ data: { kitId: k.id } }); } catch { toast.error(t("profiles.error")); }
                setProcessing(false); refresh();
              }}>{t("pressKit.retry")}</Button>
            </div>
          )}
        </details>
      ))}

      {media.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t("pressKit.library", { count: media.length })}</h3>
            {canEdit && unconfirmed > 0 && <Button size="sm" variant="outline" onClick={confirmAll}><Check className="mr-1 h-4 w-4" /> {t("pressKit.confirmAll")}</Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((m) => {
              const v = val(m);
              return (
                <div key={m.id} className="space-y-2 rounded-md border p-2"
                  draggable={canEdit} onDragStart={() => setDragId(m.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(m.id)}>
                  <div className="relative aspect-[4/3] overflow-hidden rounded bg-muted">
                    {urls[m.storage_path] && <img src={urls[m.storage_path]} alt={v.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />}
                    {canEdit && <GripVertical className="absolute left-1 top-1 h-4 w-4 text-muted-foreground" aria-hidden />}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={m.caption_status === "confirmed" ? "secondary" : "outline"}>{t(`pressKit.status.${m.caption_status}`)}</Badge>
                    {m.last_used_at && <Badge variant="outline">{t("pressKit.lastUsed", { date: new Date(m.last_used_at).toLocaleDateString() })}</Badge>}
                  </div>
                  <Select value={v.kind} disabled={!canEdit} onValueChange={(x) => setEdit(m.id, { kind: x as Kind })}>
                    <SelectTrigger aria-label={t("pressKit.kind")}><SelectValue /></SelectTrigger>
                    <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{t(`pressKit.kinds.${k}`)}</SelectItem>)}</SelectContent>
                  </Select>
                  <Textarea rows={3} value={v.caption ?? ""} disabled={!canEdit} placeholder={t("pressKit.captionPlaceholder")} aria-label={t("pressKit.caption")}
                    onChange={(e) => setEdit(m.id, { caption: e.target.value })} />
                  {v.kind === "photo" && (
                    <Input value={v.credit ?? ""} disabled={!canEdit} placeholder={t("pressKit.creditPlaceholder")} aria-label={t("pressKit.credit")}
                      onChange={(e) => setEdit(m.id, { credit: e.target.value })} />
                  )}
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => confirm(m)} disabled={!(v.caption ?? "").trim()}><Check className="mr-1 h-3.5 w-3.5" /> {t("pressKit.confirm")}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(m)} aria-label={t("pressKit.delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
