import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { listActionPeople, sendActionEmails, suggestActionTopics, type ActionRow } from "@/lib/marketing/actions.functions";
import { checkActionFile, uploadActionFile } from "@/lib/marketing/action-files";

export const ACTION_KINDS = ["client_interview", "podcast", "photo_session", "clearance_request", "other"] as const;
const NONE = "__none";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ActionFormDialog({ open, onOpenChange, action, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; action?: ActionRow | null; onSaved?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("marketing");
  const qc = useQueryClient();
  const peopleFn = useServerFn(listActionPeople);
  const emailFn = useServerFn(sendActionEmails);
  const topicsFn = useServerFn(suggestActionTopics);
  const { data: people = [] } = useQuery({ queryKey: ["marketing-action-people"], queryFn: () => peopleFn(), enabled: open, staleTime: 300_000 });
  const { data: profiles = [] } = useQuery({
    queryKey: ["marketing-action-profiles"], enabled: open, staleTime: 300_000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("marketing_project_profiles").select("id, pm_projects(name)");
      return ((data ?? []) as any[]).map((p) => ({ id: p.id as string, name: (p.pm_projects?.name ?? "—") as string }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const { data: companies = [] } = useQuery({
    queryKey: ["marketing-action-companies"], enabled: open, staleTime: 300_000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("companies").select("id, nome").order("nome").limit(2000);
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const [kind, setKind] = useState<string>("other");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<string>("");
  const [helpers, setHelpers] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [profileId, setProfileId] = useState<string>(NONE);
  const [companyId, setCompanyId] = useState<string>(NONE);
  const [brief, setBrief] = useState("");
  const [channel, setChannel] = useState<"hub" | "email">("hub");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(action?.kind ?? "other"); setTitle(action?.title ?? ""); setOwner(action?.owner_user_id ?? "");
    setHelpers(action?.helper_user_ids ?? []); setDue(action?.due_date ?? ""); setProfileId(action?.profile_id ?? NONE);
    setCompanyId(action?.crm_company_id ?? NONE); setBrief(action?.brief ?? ""); setChannel((action?.channel as "hub" | "email") ?? "hub");
    setFiles([]);
  }, [open, action]);

  const nameOf = (id: string) => people.find((p) => p.userId === id)?.name ?? action?.names[id] ?? "—";

  const addFiles = (list: FileList | null) => {
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      const bad = checkActionFile(f);
      if (bad) toast.error(t(bad === "size" ? "actions.form.tooLarge" : "actions.form.badType", { file: f.name }));
      else ok.push(f);
    }
    setFiles((p) => [...p, ...ok]);
  };

  const suggest = async () => {
    setDrafting(true);
    try {
      const r = await topicsFn({ data: {
        kind: kind as "podcast" | "client_interview", title, brief, profileId: profileId === NONE ? null : profileId,
        language: i18n.language?.startsWith("en") ? "en" : "pt",
      } });
      setBrief((b) => (b.trim() ? `${b.trim()}\n\n${r.topics}` : r.topics));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("actions.error")); }
    finally { setDrafting(false); }
  };

  const save = async () => {
    if (!title.trim() || !owner) return;
    setBusy(true);
    try {
      const row = {
        kind, title: title.trim(), brief: brief.trim() || null, owner_user_id: owner,
        helper_user_ids: helpers.filter((h) => h !== owner), due_date: due || null,
        profile_id: profileId === NONE ? null : profileId, crm_company_id: companyId === NONE ? null : companyId, channel,
      };
      let id = action?.id;
      const before = new Set(action ? [action.owner_user_id, ...action.helper_user_ids] : []);
      if (id) {
        const { error } = await (supabase as any).from("marketing_actions").update(row).eq("id", id);
        if (error) throw error;
      } else {
        id = crypto.randomUUID();
        const { data: u } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from("marketing_actions").insert({ ...row, id, created_by: u.user?.id });
        if (error) throw error;
      }
      for (const f of files) await uploadActionFile(id!, "brief", f);
      const added = [row.owner_user_id, ...row.helper_user_ids].filter((p) => !before.has(p));
      if (channel === "email" && added.length) {
        try { await emailFn({ data: { actionId: id!, userIds: added } }); }
        catch (e) { toast.error(t("actions.form.emailFailed", { error: e instanceof Error ? e.message : "" })); }
      }
      qc.invalidateQueries({ queryKey: ["marketing-actions"] });
      qc.invalidateQueries({ queryKey: ["marketing-action", id] });
      qc.invalidateQueries({ queryKey: ["marketing-actions-mine-open"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
      toast.success(t("actions.form.saved"));
      onOpenChange(false);
      onSaved?.(id!);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("actions.error")); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{action ? t("actions.form.editTitle") : t("actions.new")}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("actions.kindLabel")}</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ACTION_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`actions.kind.${k}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("actions.due")}</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("actions.titleLabel")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
          </div>
          <div className="space-y-1">
            <Label>{t("actions.owner")}</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger><SelectValue placeholder={t("actions.form.pickPerson")} /></SelectTrigger>
              <SelectContent>{people.map((p) => <SelectItem key={p.userId} value={p.userId}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("actions.helpers")}</Label>
            <Select value="" onValueChange={(v) => setHelpers((h) => (h.includes(v) ? h : [...h, v]))}>
              <SelectTrigger><SelectValue placeholder={t("actions.form.addHelper")} /></SelectTrigger>
              <SelectContent>
                {people.filter((p) => p.userId !== owner && !helpers.includes(p.userId))
                  .map((p) => <SelectItem key={p.userId} value={p.userId}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {helpers.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {helpers.map((h) => (
                  <Badge key={h} variant="secondary" className="gap-1">
                    {nameOf(h)}
                    <button type="button" aria-label={t("actions.form.removeHelper")} onClick={() => setHelpers((x) => x.filter((y) => y !== h))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label>{t("actions.project")}</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("add.none")}</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("actions.client")}</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("add.none")}</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t("actions.brief")}</Label>
              {(kind === "podcast" || kind === "client_interview") && (
                <Button type="button" size="sm" variant="outline" onClick={suggest} disabled={drafting || !title.trim()}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {drafting ? t("actions.form.suggesting") : t("actions.form.suggestTopics")}
                </Button>
              )}
            </div>
            <Textarea rows={8} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("actions.briefFiles")}</Label>
            <Input type="file" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                    <span className="truncate">{f.name}</span>
                    <button type="button" aria-label={t("actions.form.removeFile")} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("actions.form.channel")}</Label>
            <RadioGroup value={channel} onValueChange={(v) => setChannel(v as "hub" | "email")} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="hub" />{t("actions.form.channelHub")}</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="email" />{t("actions.form.channelEmail")}</label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{t("posts.cancel")}</Button>
          <Button onClick={save} disabled={busy || !title.trim() || !owner}>{busy ? t("add.saving") : t("actions.form.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
