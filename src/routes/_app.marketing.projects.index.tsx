import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CLEARANCE_BADGE,
  CLEARANCE_ORDER,
  PROFILES_QUERY_KEY,
  STORY_FIELDS,
  storyCompleteness,
  useProjectProfiles,
} from "@/lib/marketing/projects";

export const Route = createFileRoute("/_app/marketing/projects/")({
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="own">
      <ProfilesPage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Project Marketing Profiles — Portal Pedra Silva" },
      { name: "description", content: "Marketing context, stories and publication rules for studio projects." },
      { property: "og:title", content: "Project Marketing Profiles — Portal Pedra Silva" },
      { property: "og:description", content: "Marketing context, stories and publication rules for studio projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SECTORS = ["workspace", "healthcare", "residential", "hospitality", "other"] as const;
const ALL = "__all";

export function useMarketingProjects() {
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

function ProfilesPage() {
  const { t } = useTranslation("marketing");
  const { can } = useMyPermissionsV2();
  const canCurate = can("marketing.curate", "all");
  const { data: profiles = [], isLoading } = useProjectProfiles();
  const { data: projects = [] } = useMarketingProjects();
  const name = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const [sector, setSector] = useState(ALL);
  const [clearance, setClearance] = useState(ALL);
  const [incomplete, setIncomplete] = useState(ALL);
  const [addOpen, setAddOpen] = useState(false);

  const rows = profiles.filter(
    (p) =>
      (sector === ALL || p.sector === sector) &&
      (clearance === ALL || p.clearance === clearance) &&
      (incomplete === ALL || storyCompleteness(p) < STORY_FIELDS.length),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("profiles.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("profiles.subtitle")}</p>
        </div>
        {canCurate && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t("profiles.add")}
          </Button>
        )}
      </div>
      <ModuleSubnav moduleId="marketing" />

      <div className="flex flex-wrap gap-2">
        <Filter label={t("filters.sector")} value={sector} onChange={setSector}
          options={[{ v: ALL, l: t("filters.all") }, ...SECTORS.map((s) => ({ v: s, l: t(`sector.${s}`) }))]} />
        <Filter label={t("filters.clearance")} value={clearance} onChange={setClearance}
          options={[{ v: ALL, l: t("filters.all") }, ...CLEARANCE_ORDER.map((s) => ({ v: s, l: t(`clearance.${s}`) }))]} />
        <Filter label={t("profiles.story")} value={incomplete} onChange={setIncomplete}
          options={[{ v: ALL, l: t("filters.all") }, { v: "incomplete", l: t("profiles.storyIncomplete") }]} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("inbox.loading")}</p>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">{t("profiles.empty")}</Card>
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((p) => (
            <Link key={p.id} to="/marketing/projects/$profileId" params={{ profileId: p.id }}
              className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/50">
              <span className="min-w-0 flex-1 truncate font-medium">{name.get(p.project_id) ?? "—"}</span>
              {p.sector && <span className="text-sm text-muted-foreground">{t(`sector.${p.sector}`)}</span>}
              {p.location && <span className="text-sm text-muted-foreground">{p.location}</span>}
              <Badge variant="outline" className={CLEARANCE_BADGE[p.clearance]}>{t(`clearance.${p.clearance}`)}</Badge>
              <Badge variant="secondary">{t(`nameRule.${p.name_rule}`)}</Badge>
              <span className="text-xs text-muted-foreground">
                {t("profiles.completeness", { n: storyCompleteness(p), total: STORY_FIELDS.length })}
              </span>
            </Link>
          ))}
        </Card>
      )}

      {canCurate && (
        <AddProfileDialog open={addOpen} onOpenChange={setAddOpen}
          projects={projects.filter((p) => !profiles.some((x) => x.project_id === p.id))} />
      )}
    </div>
  );
}

function Filter(props: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[140px]" aria-label={props.label}>
        <span className="mr-1 text-muted-foreground">{props.label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AddProfileDialog({ open, onOpenChange, projects }: { open: boolean; onOpenChange: (o: boolean) => void; projects: { id: string; name: string }[] }) {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("marketing_project_profiles").insert({ project_id: projectId }).select("id").single();
    setSaving(false);
    if (error || !data) { toast.error(t("profiles.error")); return; }
    qc.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
    onOpenChange(false);
    navigate({ to: "/marketing/projects/$profileId", params: { profileId: data.id } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("profiles.add")}</DialogTitle></DialogHeader>
        <div className="space-y-1">
          <Label>{t("filters.project")}</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder={t("profiles.pickProject")} /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={!projectId || saving}>{t("profiles.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
