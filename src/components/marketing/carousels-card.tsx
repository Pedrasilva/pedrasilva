import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { GalleryHorizontal, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DeleteExpenseDialog } from "@/components/hr/DeleteExpenseDialog";
import { deleteComposition } from "@/lib/marketing/compositions.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** "New carousel" — with profileId preselected (project page) or a project picker (planner). */
export function NewCarouselButton({ profileId, variant = "outline" }: { profileId?: string; variant?: "outline" | "default" }) {
  const { t } = useTranslation("marketing");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("");
  const [pick, setPick] = useState(profileId ?? "");
  const [busy, setBusy] = useState(false);
  const { data: options = [] } = useQuery({
    queryKey: ["marketing-focus-profiles"],
    enabled: open && !profileId,
    queryFn: async () => {
      const { data, error } = await db.from("marketing_project_profiles").select("id, pm_projects(name)");
      if (error) throw error;
      return ((data ?? []) as { id: string; pm_projects: { name: string } | null }[])
        .map((p) => ({ id: p.id, name: p.pm_projects?.name ?? "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const create = async () => {
    if (!title.trim() || !pick) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await db.from("marketing_compositions")
      .insert({ profile_id: pick, title: title.trim(), intent: intent.trim() || null, created_by: u.user?.id }).select("id").single();
    setBusy(false);
    if (error || !data) { toast.error(t("carousel.notAllowed")); return; }
    setOpen(false);
    navigate({ to: "/marketing/carousels/$id", params: { id: data.id } });
  };
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />{t("carousel.new")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("carousel.new")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!profileId && (
              <div className="space-y-1">
                <Label>{t("carousel.project")}</Label>
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger><SelectValue placeholder={t("carousel.pickProject")} /></SelectTrigger>
                  <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>{t("carousel.titleLabel")}</Label>
              <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("carousel.intent")}</Label>
              <Textarea rows={3} value={intent} maxLength={4000} onChange={(e) => setIntent(e.target.value)} placeholder={t("carousel.intentHint")} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={busy || !title.trim() || !pick}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("carousel.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Confirm + delete a draft carousel (server path also cleans voice files). Throws on failure so the dialog stays open. */
export function DeleteCarouselDialog({ compositionId, profileId, open, onOpenChange, onDeleted }: {
  compositionId: string; profileId: string; open: boolean; onOpenChange: (v: boolean) => void; onDeleted?: () => void;
}) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const run = useServerFn(deleteComposition);
  const confirm = async () => {
    try { await run({ data: { compositionId } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); throw e; }
    toast.success(t("carousel.deleted"));
    qc.invalidateQueries({ queryKey: ["marketing-compositions", profileId] });
    onDeleted?.();
  };
  return (
    <DeleteExpenseDialog open={open} onOpenChange={onOpenChange} onConfirm={confirm}
      title={t("carousel.delete")} description={t("carousel.deleteConfirm")}
      confirmLabel={t("carousel.delete")} loadingLabel={t("carousel.deleting")} />
  );
}

/** Project profile: list of carousels with status. */
export function CarouselsCard({ profileId, canEdit }: { profileId: string; canEdit: boolean }) {
  const { t } = useTranslation("marketing");
  const [toDelete, setToDelete] = useState<string | null>(null);
  const { data: rows = [] } = useQuery({
    queryKey: ["marketing-compositions", profileId],
    queryFn: async () => {
      const { data, error } = await db.from("marketing_compositions")
        .select("id, title, status, created_at, marketing_composition_slides(count)").eq("profile_id", profileId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; status: "draft" | "sent"; created_at: string; marketing_composition_slides: { count: number }[] }[];
    },
  });
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><GalleryHorizontal className="h-4 w-4" aria-hidden />{t("carousel.listTitle")}</h2>
        {canEdit && <div className="ml-auto"><NewCarouselButton profileId={profileId} /></div>}
      </div>
      {!rows.length && <p className="text-sm text-muted-foreground">{t("carousel.listEmpty")}</p>}
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
            <Link to="/marketing/carousels/$id" params={{ id: r.id }} className="font-medium hover:underline">{r.title}</Link>
            <span className="text-xs text-muted-foreground">{t("carousel.slideCount", { count: r.marketing_composition_slides?.[0]?.count ?? 0 })}</span>
            <Badge variant={r.status === "sent" ? "default" : "outline"} className="ml-auto">{t(`carousel.status.${r.status}`)}</Badge>
            {canEdit && r.status === "draft" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("carousel.rowMenu")}><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setToDelete(r.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />{t("carousel.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>
      {toDelete && <DeleteCarouselDialog compositionId={toDelete} profileId={profileId} open onOpenChange={(v) => !v && setToDelete(null)} onDeleted={() => setToDelete(null)} />}
    </Card>
  );
}
