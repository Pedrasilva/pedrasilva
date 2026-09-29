import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageIcon, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CLEARANCE_BADGE,
  CLEARANCE_ORDER,
  NAME_RULES,
  PROFILES_QUERY_KEY,
  STORY_FIELDS,
  type ProjectProfile,
} from "@/lib/marketing/projects";

export const Route = createFileRoute("/_app/marketing/projects/$profileId")({
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="own">
      <ProfilePage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Project Marketing Profile — Portal Pedra Silva" },
      { name: "description", content: "Story, aliases and publication rules for one studio project." },
      { property: "og:title", content: "Project Marketing Profile — Portal Pedra Silva" },
      { property: "og:description", content: "Story, aliases and publication rules for one studio project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SECTORS = ["workspace", "healthcare", "residential", "hospitality", "other"] as const;
const STAGES = ["design", "construction", "completed", "other"] as const;
const NONE = "__none";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function ProfilePage() {
  const { profileId } = Route.useParams();
  const { t } = useTranslation("marketing");
  const { user } = useAuth();
  const { can } = useMyPermissionsV2();
  const canCurate = can("marketing.curate", "all");
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["marketing-project-profile", profileId],
    queryFn: async () => {
      const { data, error } = await db.from("marketing_project_profiles").select("*").eq("id", profileId).maybeSingle();
      if (error) throw error;
      return data as ProjectProfile | null;
    },
  });
  const projectId = profile?.project_id;

  const { data: project } = useQuery({
    queryKey: ["marketing-profile-project", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase.from("pm_projects").select("id, name, client").eq("id", projectId!).maybeSingle();
      return data as { id: string; name: string; client: string | null } | null;
    },
  });
  const { data: team = [] } = useQuery({
    queryKey: ["marketing-profile-team", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await db.from("pm_project_team").select("id, role, pm_resources(name)").eq("project_id", projectId);
      return (data ?? []) as Array<{ id: string; role: string | null; pm_resources: { name: string } | null }>;
    },
  });
  const { data: isMember = false } = useQuery({
    queryKey: ["marketing-profile-member", projectId, user?.id],
    enabled: !!projectId && !!user,
    queryFn: async () => {
      const { data } = await db.rpc("marketing_is_project_team_member", { _user_id: user!.id, _project_id: projectId });
      return data === true;
    },
  });
  const { data: captures = [] } = useQuery({
    queryKey: ["marketing-profile-captures", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_captures")
        .select("id, raw_text, marketing_capture_assets(storage_path, mime_type)")
        .eq("project_id", projectId!)
        .order("received_at", { ascending: false });
      return (data ?? []) as unknown as Array<{ id: string; raw_text: string | null; marketing_capture_assets: { storage_path: string; mime_type: string }[] }>;
    },
  });
  const thumbPaths = captures
    .map((c) => c.marketing_capture_assets.find((a) => a.mime_type.startsWith("image/"))?.storage_path)
    .filter((p): p is string => !!p);
  const { data: thumbs = {} } = useQuery({
    queryKey: ["marketing-signed", thumbPaths],
    enabled: thumbPaths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("marketing-assets").createSignedUrls(thumbPaths, 3600);
      const m: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      return m;
    },
  });

  const canEditStory = canCurate || (can("marketing.contribute", "own") && isMember);
  const [draft, setDraft] = useState<Partial<ProjectProfile>>({});
  const [aliasInput, setAliasInput] = useState("");
  const [saving, setSaving] = useState(false);

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">{t("inbox.loading")}</p>;
  if (!profile) return <p className="p-6 text-sm text-muted-foreground">{t("profiles.notFound")}</p>;

  const v = { ...profile, ...draft };
  const set = (patch: Partial<ProjectProfile>) => setDraft((d) => ({ ...d, ...patch }));
  const needsDescription = v.name_rule !== "name" && !(v.public_description ?? "").trim();

  const addAlias = () => {
    const a = aliasInput.trim().toLowerCase();
    if (a && !v.aliases.includes(a)) set({ aliases: [...v.aliases, a] });
    setAliasInput("");
  };

  const save = async () => {
    if (canCurate && needsDescription) { toast.error(t("profile.descriptionRequired")); return; }
    setSaving(true);
    const patch: Record<string, unknown> = { aliases: v.aliases };
    for (const f of STORY_FIELDS) patch[f] = v[f];
    if (canCurate) {
      Object.assign(patch, {
        sector: v.sector, location: v.location, stage: v.stage, year_completed: v.year_completed,
        name_rule: v.name_rule, public_description: v.public_description, clearance: v.clearance, rules_notes: v.rules_notes,
      });
    }
    const { error } = await db.from("marketing_project_profiles").update(patch).eq("id", profile.id);
    setSaving(false);
    if (error) { toast.error(t("profiles.error")); return; }
    toast.success(t("detail.saved"));
    setDraft({});
    qc.invalidateQueries({ queryKey: ["marketing-project-profile", profileId] });
    qc.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
  };

  const remove = async () => {
    if (!confirm(t("profile.deleteConfirm"))) return;
    const { error } = await db.from("marketing_project_profiles").delete().eq("id", profile.id);
    if (error) { toast.error(t("profiles.error")); return; }
    qc.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
    window.history.back();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <Link to="/marketing/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("profiles.title")}
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">
          {project ? (
            <Link to="/projects/$projectId" params={{ projectId: project.id }} className="hover:underline">{project.name}</Link>
          ) : "—"}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {project?.client && <span>{t("profile.client")}: {project.client}</span>}
          {profile.sector && <span>{t(`sector.${profile.sector}`)}</span>}
          {profile.location && <span>{profile.location}</span>}
          {profile.stage && <span>{t(`stage.${profile.stage}`)}</span>}
        </div>
        {team.length > 0 && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t("profile.team")}: </span>
            {team.map((m) => m.pm_resources?.name).filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("profile.facts")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Opt label={t("filters.sector")} value={v.sector} disabled={!canCurate} onChange={(x) => set({ sector: x as ProjectProfile["sector"] })}
            options={SECTORS.map((s) => ({ v: s, l: t(`sector.${s}`) }))} none={t("add.none")} />
          <Opt label={t("detail.stage")} value={v.stage} disabled={!canCurate} onChange={(x) => set({ stage: x as ProjectProfile["stage"] })}
            options={STAGES.map((s) => ({ v: s, l: t(`stage.${s}`) }))} none={t("add.none")} />
          <div className="space-y-1">
            <Label className="text-xs">{t("profile.location")}</Label>
            <Input value={v.location ?? ""} disabled={!canCurate} onChange={(e) => set({ location: e.target.value || null })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("profile.yearCompleted")}</Label>
            <Input type="number" value={v.year_completed ?? ""} disabled={!canCurate}
              onChange={(e) => set({ year_completed: e.target.value ? Number(e.target.value) : null })} />
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("profile.storyTitle")}</h2>
        {!canEditStory && <p className="text-xs text-muted-foreground">{t("detail.readOnly")}</p>}
        {STORY_FIELDS.map((f) => (
          <div key={f} className="space-y-1">
            <Label>{t(`profile.fields.${f}`)}</Label>
            <p className="text-xs text-muted-foreground">{t(`profile.fields.${f}Hint`)}</p>
            <Textarea rows={3} value={v[f] ?? ""} disabled={!canEditStory} onChange={(e) => set({ [f]: e.target.value || null })} />
          </div>
        ))}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("profile.aliases")}</h2>
        <p className="text-xs text-muted-foreground">{t("profile.aliasesHint")}</p>
        <div className="flex flex-wrap gap-2">
          {v.aliases.map((a) => (
            <Badge key={a} variant="secondary" className="gap-1">
              {a}
              {canEditStory && (
                <button type="button" aria-label={t("profile.removeAlias")} onClick={() => set({ aliases: v.aliases.filter((x) => x !== a) })}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        {canEditStory && (
          <div className="flex gap-2">
            <Input value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} placeholder={t("profile.addAlias")}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }} />
            <Button variant="outline" onClick={addAlias}>{t("profile.addAliasButton")}</Button>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">{t("profile.rules")}</h2>
        {!canCurate && <p className="text-xs text-muted-foreground">{t("profile.rulesReadOnly")}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("profile.nameRule")}</Label>
            <Select value={v.name_rule} disabled={!canCurate} onValueChange={(x) => set({ name_rule: x as ProjectProfile["name_rule"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NAME_RULES.map((r) => <SelectItem key={r} value={r}>{t(`nameRule.${r}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("filters.clearance")}</Label>
            <Select value={v.clearance} disabled={!canCurate} onValueChange={(x) => set({ clearance: x as ProjectProfile["clearance"] })}>
              <SelectTrigger className={cn("border", CLEARANCE_BADGE[v.clearance])}><SelectValue /></SelectTrigger>
              <SelectContent>{CLEARANCE_ORDER.map((c) => <SelectItem key={c} value={c}>{t(`clearance.${c}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">{t("profile.publicDescription")}{v.name_rule !== "name" && " *"}</Label>
            <Input value={v.public_description ?? ""} disabled={!canCurate} placeholder={t("profile.publicDescriptionHint")}
              onChange={(e) => set({ public_description: e.target.value || null })} />
            {canCurate && needsDescription && <p className="text-xs text-destructive">{t("profile.descriptionRequired")}</p>}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">{t("profile.rulesNotes")}</Label>
            <Textarea rows={2} value={v.rules_notes ?? ""} disabled={!canCurate} onChange={(e) => set({ rules_notes: e.target.value || null })} />
          </div>
        </div>
      </Card>

      <div className="flex gap-2">
        {canEditStory && (
          <Button onClick={save} disabled={saving || Object.keys(draft).length === 0}>{t("detail.save")}</Button>
        )}
        {canCurate && (
          <Button variant="outline" onClick={remove}><Trash2 className="mr-1 h-4 w-4" /> {t("profile.delete")}</Button>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">{t("profile.captures")}</h2>
        {captures.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("inbox.empty")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {captures.map((c) => {
              const img = c.marketing_capture_assets.find((a) => a.mime_type.startsWith("image/"));
              return (
                <Link key={c.id} to="/marketing" search={{ capture: c.id }} className="flex aspect-square items-center justify-center overflow-hidden rounded bg-muted" title={(c.raw_text ?? "").slice(0, 80)}>
                  {img && thumbs[img.storage_path]
                    ? <img src={thumbs[img.storage_path]} alt="" className="h-full w-full object-cover" loading="lazy" />
                    : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Opt(props: { label: string; value: string | null; disabled: boolean; none: string; onChange: (v: string | null) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{props.label}</Label>
      <Select value={props.value ?? NONE} disabled={props.disabled} onValueChange={(x) => props.onChange(x === NONE ? null : x)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{props.none}</SelectItem>
          {props.options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
