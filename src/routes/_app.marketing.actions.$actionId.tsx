import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getAction, routeOutcomeFile, type ActionFile } from "@/lib/marketing/actions.functions";
import { checkActionFile, uploadActionFile } from "@/lib/marketing/action-files";
import { ActionFormDialog } from "@/components/marketing/action-form-dialog";

export const Route = createFileRoute("/_app/marketing/actions/$actionId")({
  component: ActionPage,
  head: () => ({
    meta: [
      { title: "Marketing action — Portal Pedra Silva" },
      { name: "description", content: "Brief, files, owner and outcome of a marketing action." },
      { property: "og:title", content: "Marketing action — Portal Pedra Silva" },
      { property: "og:description", content: "Brief, files, owner and outcome of a marketing action." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ActionPage() {
  const { actionId } = Route.useParams();
  const { t, i18n } = useTranslation("marketing");
  const locale = i18n.language?.startsWith("en") ? "en-GB" : "pt-PT";
  const qc = useQueryClient();
  const fn = useServerFn(getAction);
  const routeFn = useServerFn(routeOutcomeFile);
  const { data, isLoading } = useQuery({ queryKey: ["marketing-action", actionId], queryFn: () => fn({ data: { id: actionId } }) });
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">{t("inbox.loading")}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">{t("actions.notFound")}</p>;
  const { action: a, files: all, canCurate, me } = data;
  const participant = a.owner_user_id === me || a.helper_user_ids.includes(me);
  const open = a.status === "open";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["marketing-action", actionId] });
    qc.invalidateQueries({ queryKey: ["marketing-actions"] });
    qc.invalidateQueries({ queryKey: ["marketing-actions-mine-open"] });
    qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  const pick = (list: FileList | null) => {
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      const bad = checkActionFile(f);
      if (bad) toast.error(t(bad === "size" ? "actions.form.tooLarge" : "actions.form.badType", { file: f.name }));
      else ok.push(f);
    }
    setFiles((p) => [...p, ...ok]);
  };

  const uploadOutcome = async () => {
    for (let i = 0; i < files.length; i++) {
      setBusy(t("actions.uploading", { done: i + 1, total: files.length }));
      const id = await uploadActionFile(a.id, "outcome", files[i]);
      const r = await routeFn({ data: { fileId: id } });
      if (r.routed === "briefing") toast.success(t("actions.routed.briefing", { file: files[i].name }));
      else if (r.routed === "capture") toast.success(t("actions.routed.capture", { file: files[i].name }));
    }
    setFiles([]);
  };

  const addFilesOnly = async () => {
    try { await uploadOutcome(); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : t("actions.error")); }
    finally { setBusy(null); }
  };

  const complete = async () => {
    try {
      await uploadOutcome();
      setBusy(t("add.saving"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("marketing_actions")
        .update({ status: "done", outcome_notes: notes.trim() || null }).eq("id", a.id);
      if (error) throw error;
      toast.success(t("actions.completed"));
      setCompleting(false);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("actions.error")); }
    finally { setBusy(null); }
  };

  const cancel = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("marketing_actions").update({ status: "cancelled" }).eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success(t("actions.cancelledToast")); refresh(); }
  };

  const FileList = ({ list }: { list: ActionFile[] }) => list.length === 0 ? (
    <p className="text-sm text-muted-foreground">{t("detail.noAssets")}</p>
  ) : (
    <ul className="space-y-1">
      {list.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
          {f.url ? <a href={f.url} className="inline-flex items-center gap-1 hover:underline"><Download className="h-3.5 w-3.5" />{f.file_name}</a> : f.file_name}
          <span className="text-xs text-muted-foreground">{a.names[f.created_by] ?? ""}</span>
          {f.routed_to && f.routed_to !== "file" && <Badge variant="outline">{t(`actions.routedBadge.${f.routed_to}`)}</Badge>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <p className="text-xs text-muted-foreground"><Link to="/marketing/actions" className="hover:underline">{t("actions.title")}</Link> · {t(`actions.kind.${a.kind}`)}</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{a.title}</h1>
          <Badge variant={open ? "secondary" : "outline"}>{t(`actions.status.${a.status}`)}</Badge>
        </div>
      </div>
      <ModuleSubnav moduleId="marketing" />
      <Card className="grid gap-3 p-4 text-sm sm:grid-cols-2">
        <div><p className="text-xs text-muted-foreground">{t("actions.owner")}</p>{a.names[a.owner_user_id] ?? "—"}</div>
        <div><p className="text-xs text-muted-foreground">{t("actions.helpers")}</p>{a.helper_user_ids.map((h) => a.names[h] ?? "—").join(", ") || "—"}</div>
        <div><p className="text-xs text-muted-foreground">{t("actions.due")}</p>{a.due_date ? new Date(a.due_date).toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" }) : "—"}</div>
        <div>
          <p className="text-xs text-muted-foreground">{t("actions.project")}</p>
          {a.profile_id ? <Link to="/marketing/projects/$profileId" params={{ profileId: a.profile_id }} className="hover:underline">{a.projectName ?? "—"}</Link> : "—"}
        </div>
        {a.companyName && <div><p className="text-xs text-muted-foreground">{t("actions.client")}</p>{a.companyName}</div>}
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">{t("actions.brief")}</h2>
        <p className="whitespace-pre-wrap text-sm">{a.brief || "—"}</p>
        <FileList list={all.filter((f) => f.purpose === "brief")} />
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">{t("actions.outcome")}</h2>
        {a.outcome_notes && <p className="whitespace-pre-wrap text-sm">{a.outcome_notes}</p>}
        {a.completed_at && <p className="text-xs text-muted-foreground">{t("actions.completedBy", { name: a.names[a.completed_by ?? ""] ?? "—", date: new Date(a.completed_at).toLocaleDateString(locale) })}</p>}
        <FileList list={all.filter((f) => f.purpose === "outcome")} />
        {open && participant && (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="file" multiple className="max-w-xs" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && !completing && (
              <Button size="sm" variant="outline" onClick={addFilesOnly} disabled={!!busy}>
                <Upload className="mr-1 h-3.5 w-3.5" />{busy ?? t("actions.addFiles", { count: files.length })}
              </Button>
            )}
          </div>
        )}
        {open && participant && <p className="text-xs text-muted-foreground">{t("actions.routingHint")}</p>}
      </Card>
      <div className="flex flex-wrap gap-2">
        {open && participant && <Button onClick={() => setCompleting(true)}>{t("actions.complete")}</Button>}
        {open && canCurate && <Button variant="outline" onClick={() => setEditing(true)}>{t("actions.edit")}</Button>}
        {open && canCurate && <Button variant="ghost" onClick={() => setCancelling(true)}>{t("actions.cancelAction")}</Button>}
      </div>

      <Dialog open={completing} onOpenChange={(v) => !busy && setCompleting(v)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("actions.whatCameOut")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t("actions.outcomeNotes")}</Label><Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>{t("actions.outcomeFiles")}</Label>
              <Input type="file" multiple onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
              {files.length > 0 && <p className="text-xs text-muted-foreground">{files.map((f) => f.name).join(", ")}</p>}
              <p className="text-xs text-muted-foreground">{t("actions.routingHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleting(false)} disabled={!!busy}>{t("posts.cancel")}</Button>
            <Button onClick={complete} disabled={!!busy || (!notes.trim() && files.length === 0)}>{busy ?? t("actions.complete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("actions.cancelConfirm")}</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("posts.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>{t("actions.cancelAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ActionFormDialog open={editing} onOpenChange={setEditing} action={a} />
    </div>
  );
}
