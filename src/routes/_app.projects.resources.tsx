import { useDateLocale } from "@/i18n/use-date-locale";
import i18n from "@/i18n/index";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/projects/app-shell";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useDeleteResource,
  useResources,
  useUpdateResource,
  type ResourceTeam,
} from "@/lib/projects/use-planner";
import { useDefaultResourceRates } from "@/lib/projects/use-default-rates";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from '@/lib/toast';
import { euros } from "@/lib/projects/gantt-utils";
import type { Resource } from "@/lib/projects/types";

export const Route = createFileRoute("/_app/projects/resources")({
  head: () => ({ meta: [{ title: "Project team — PSA Hub" }, { name: "description", content: "Project team in the Pedra Silva Architects operations hub." }, { property: "og:title", content: "Project team — PSA Hub" }, { property: "og:description", content: "Project team in the Pedra Silva Architects operations hub." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ResourcesPage,
});

type TabKey = "all" | "project" | "back_office" | "inactive";

const TEAM_LABEL: Record<ResourceTeam, string> = {
  project: "projects:resources.ui.projectTeam",
  back_office: "projects:resources.ui.backoffice",
};

type FullResource = Resource & {
  team?: string | null;
  active?: boolean;
  collaborator_id?: string | null;
};

function useArchivedCollaboratorIds() {
  return useQuery({
    queryKey: ["hr-archived-collaborator-ids"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id")
        .not("archived_at", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.id));
    },
  });
}

function ResourcesPage() {
  const { t } = useTranslation(["projects", "common", "glossary"]);
  const { data: resources } = useResources();
  const { data: defaultRates } = useDefaultResourceRates();
  const { data: archivedIds } = useArchivedCollaboratorIds();
  const update = useUpdateResource();
  const del = useDeleteResource();

  const [tab, setTab] = useState<TabKey>("all");

  const all = (resources ?? []) as FullResource[];

  // Active = resource.active !== false AND linked HR collaborator is not archived.
  // HR collaborator status is the source of truth — a person archived in HR
  // must not appear in active project views even if pm_resources.active=true.
  const isResourceActive = (r: FullResource) => {
    if (r.active === false) return false;
    if (r.collaborator_id && archivedIds?.has(r.collaborator_id)) return false;
    return true;
  };

  const filtered = useMemo(() => {
    if (tab === "all") return all.filter(isResourceActive);
    if (tab === "inactive") return all.filter((r) => !isResourceActive(r));
    return all.filter(
      (r) => isResourceActive(r) && ((r.team as ResourceTeam) ?? "project") === tab,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, tab, archivedIds]);

  const counts = useMemo(() => {
    const active = all.filter(isResourceActive);
    const proj = active.filter((r) => ((r.team as ResourceTeam) ?? "project") === "project").length;
    return {
      all: active.length,
      project: proj,
      back_office: active.length - proj,
      inactive: all.length - active.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, archivedIds]);

  async function toggleActive(r: FullResource, next: boolean) {
    try {
      await update.mutateAsync({ id: r.id, patch: { active: next } });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <AppShell active="resources">
      <div className="w-full px-6 py-10">
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground"> {t("projects:people")} </p>
            <h1 className="text-4xl font-semibold tracking-tight"> {t("glossary:entity.team")} </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
               {t("projects:resources.ui.subtitle")} </p>
          </div>
        </div>

        <div className="mt-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              <TabsTrigger value="all">
                 {t("common:all")} <span className="ml-1.5 text-xs text-muted-foreground">{counts.all}</span>
              </TabsTrigger>
              <TabsTrigger value="project">
                 {t("projects:resources.tabs.project")} <span className="ml-1.5 text-xs text-muted-foreground">{counts.project}</span>
              </TabsTrigger>
              <TabsTrigger value="back_office">
                 {t("projects:resources.ui.backoffice")} <span className="ml-1.5 text-xs text-muted-foreground">{counts.back_office}</span>
              </TabsTrigger>
              <TabsTrigger value="inactive">
                 {t("common:inactive")} <span className="ml-1.5 text-xs text-muted-foreground">{counts.inactive}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left"> {t("common:name")} </th>
                <th className="px-4 py-3 text-left"> {t("glossary:hr.role")} </th>
                <th className="px-4 py-3 text-left"> {t("glossary:entity.team")} </th>
                <th className="px-4 py-3 text-right"> {t("projects:resources.ui.costPerHour")} </th>
                <th className="px-4 py-3 text-right"> {t("projects:resources.ui.salePerHour75")} </th>
                <th className="px-4 py-3 text-right"> {t("projects:resources.ui.reference100")} </th>
                <th className="px-4 py-3 text-right"> {t("glossary:performance.capacity")} </th>
                <th className="px-4 py-3 text-center"> {t("common:active")} </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const rTeam = ((r.team as ResourceTeam) ?? "project") as ResourceTeam;
                const isActive = isResourceActive(r);
                const hrArchived = !!(r.collaborator_id && archivedIds?.has(r.collaborator_id));
                const hr = defaultRates?.get(r.id);
                // Only the explicit override flag counts. Legacy default values
                // (hourly_rate=100 with no human action) must NOT show as override.
                const hasOverride = !!(r as FullResource & { hourly_rate_is_override?: boolean })
                  .hourly_rate_is_override;
                const manualSale = Number(r.hourly_rate);
                const saleValue = hasOverride && manualSale > 0 ? manualSale : hr?.sale ?? 0;
                return (
                  <tr key={r.id} className={`border-t border-border ${!isActive ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <Link
                        to="/projects/resources/$resourceId"
                        params={{ resourceId: r.id }}
                        className="group inline-flex items-center gap-3"
                      >
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="font-medium group-hover:underline">{r.name}</span>
                        {hrArchived && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                             {t("projects:resources.ui.hrArchived")} </span>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.role ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          rTeam === "project"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t(TEAM_LABEL[rTeam])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {hr?.cost ? euros(hr.cost) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {saleValue > 0 ? (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex cursor-help flex-col items-end leading-tight">
                                <span>{euros(saleValue)}</span>
                                <span
                                  className={`text-[10px] uppercase tracking-wider ${
                                    hasOverride ? "text-amber-600" : "text-muted-foreground"
                                  }`}
                                >
                                  {hasOverride ? t("projects:resources.ui.override") : t("projects:resources.ui.hrDefault75")}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs text-left">
                              {hasOverride ? (
                                <div className="space-y-1">
                                  <p className="font-medium"> {t("projects:resources.ui.override")} </p>
                                  <p className="text-[11px] opacity-90">
                                     {t("projects:resources.ui.overrideHint")} </p>
                                  {hr?.sale ? (
                                    <p className="text-[11px] opacity-75">
                                      {t("projects:resources.ui.defaultWouldBe", { value: euros(hr.sale) })}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <p className="font-medium"> {t("projects:resources.ui.hrDefault75")} </p>
                                  <p className="text-[11px] opacity-90">
                                     {t("projects:resources.ui.defaultHint")} </p>
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {hr?.sale100 ? euros(hr.sale100) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{Number(r.weekly_capacity)}  {t("common:units.hoursPerWeek")} </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={isActive}
                        disabled={hrArchived}
                        onCheckedChange={(v) => toggleActive(r, v)}
                      />
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(t("projects:resources.ui.removeConfirm", { name: r.name }))) return;
                          try {
                            await del.mutateAsync(r.id);
                            toast.success(t("common:removed"));
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {all.length
                      ? t("projects:resources.emptyFiltered")
                      : t("projects:resources.ui.noTeam")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("projects:resources.ui.pricingBefore")} <strong>{t("projects:resources.ui.pricingBand")}</strong>{t("projects:resources.ui.pricingMiddle")} <span className="text-amber-600"> {t("projects:resources.ui.override")} </span> {t("projects:resources.ui.pricingAfter")} <em> {t("common:inactive")} </em> {t("projects:resources.ui.pricingEnd")}
        </p>
      </div>
    </AppShell>
  );
}
