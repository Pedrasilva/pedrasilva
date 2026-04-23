import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, GitBranch, TrendingUp } from "lucide-react";
import { formatEUR, PIPELINE_STATUSES, type FeeProposal } from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/")({
  component: CrmOverview,
});

function CrmOverview() {
  const { t } = useTranslation("crm");
  const { data: companiesCount = 0 } = useQuery({
    queryKey: ["crm-companies-count"],
    queryFn: async () => {
      const { count } = await supabase.from("companies").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: contactsCount = 0 } = useQuery({
    queryKey: ["crm-contacts-count"],
    queryFn: async () => {
      const { count } = await supabase.from("contacts").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ["crm-proposals-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_proposals").select("*");
      if (error) throw error;
      return (data ?? []) as FeeProposal[];
    },
  });

  const openProposals = proposals.filter((p) => p.pipeline_status !== "ganho" && p.pipeline_status !== "perdido");
  const weightedPipeline = openProposals.reduce((s, p) => s + p.valor * (p.probabilidade / 100), 0);
  const totalOpen = openProposals.reduce((s, p) => s + p.valor, 0);

  const byStatus = PIPELINE_STATUSES.map((s) => ({
    ...s,
    label: t(`pipelineStatus.${s.value}`),
    count: proposals.filter((p) => p.pipeline_status === s.value).length,
    value: proposals.filter((p) => p.pipeline_status === s.value).reduce((sum, p) => sum + p.valor, 0),
  }));

  const stats = [
    { label: t("overview.stats.companies"), value: companiesCount, icon: Building2, to: "/crm/companies" as const },
    { label: t("overview.stats.contacts"), value: contactsCount, icon: Users, to: "/crm/contacts" as const },
    { label: t("overview.stats.openProposals"), value: openProposals.length, icon: GitBranch, to: "/crm/pipeline" as const },
    { label: t("overview.stats.weightedPipeline"), value: formatEUR(weightedPipeline), icon: TrendingUp, to: "/crm/pipeline" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} to={s.to}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-xl font-semibold">{s.value}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("overview.pipelineSummary")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {byStatus.map((s) => (
              <div key={s.value} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.color}`} />
                  <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                </div>
                <div className="mt-1 text-lg font-semibold">{s.count}</div>
                <div className="text-xs text-muted-foreground">{formatEUR(s.value)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("overview.totalOpen")}</span>
            <span className="font-semibold">{formatEUR(totalOpen)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
