import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2, Users, TrendingUp, Target, ArrowRight, FileText, Plus, Lightbulb,
} from "lucide-react";
import {
  formatEUR, OPPORTUNITY_STAGES, QUOTE_STATUSES,
  type CrmOpportunity, type FeeProposal,
} from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/")({
  component: CrmOverview,
});

type OppRow = CrmOpportunity & { company: { id: string; nome: string } | null };
type QuoteRow = FeeProposal & {
  company: { id: string; nome: string } | null;
  opportunity: { id: string; name: string } | null;
};

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

  const { data: opportunities = [] } = useQuery({
    queryKey: ["crm-opportunities-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_opportunities")
        .select("*, company:companies(id, nome)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OppRow[];
    },
  });

  const { data: draftQuotes = [] } = useQuery({
    queryKey: ["crm-draft-quotes-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("*, company:companies(id, nome), opportunity:crm_opportunities(id, name)")
        .in("quote_status", ["draft", "sent"])
        .order("updated_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as QuoteRow[];
    },
  });

  const openOpps = opportunities.filter((o) => o.stage !== "won" && o.stage !== "lost");
  const weightedPipeline = openOpps.reduce(
    (s, o) => s + Number(o.estimated_fee) * (Number(o.probability) / 100),
    0,
  );
  const totalOpen = openOpps.reduce((s, o) => s + Number(o.estimated_fee), 0);

  const byStage = OPPORTUNITY_STAGES.map((s) => ({
    ...s,
    label: t(`stage.${s.value}`),
    count: opportunities.filter((o) => o.stage === s.value).length,
    value: opportunities.filter((o) => o.stage === s.value).reduce((sum, o) => sum + Number(o.estimated_fee), 0),
  }));

  const stats = [
    { label: t("overview.stats.companies"), value: companiesCount, icon: Building2, to: "/crm/companies" as const },
    { label: t("overview.stats.contacts"), value: contactsCount, icon: Users, to: "/crm/contacts" as const },
    { label: t("overview.stats.openOpportunities"), value: openOpps.length, icon: Target, to: "/crm/opportunities" as const },
    { label: t("overview.stats.weightedPipeline"), value: formatEUR(weightedPipeline), icon: TrendingUp, to: "/crm/opportunities" as const },
  ];

  const recentOpps = openOpps.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Quick start callout */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-medium">{t("overview.quickStartTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("overview.quickStartHint")}</div>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/crm/opportunities">
              <Plus className="h-4 w-4 mr-1" /> {t("overview.newOpportunity")}
            </Link>
          </Button>
        </CardContent>
      </Card>

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
            {byStage.map((s) => (
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

      {/* Recent opportunities + draft quotes */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("overview.recentOpportunitiesTitle")}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/crm/opportunities">
                {t("overview.viewAllOpportunities")} <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOpps.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <Target className="h-6 w-6 opacity-50" />
                <span>{t("overview.recentOpportunitiesEmpty")}</span>
              </div>
            ) : (
              <ul className="divide-y">
                {recentOpps.map((o) => {
                  const stage = OPPORTUNITY_STAGES.find((s) => s.value === o.stage);
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                      <Link
                        to="/crm/opportunities/$opportunityId"
                        params={{ opportunityId: o.id }}
                        className="flex-1 min-w-0"
                      >
                        <div className="font-medium text-sm truncate hover:underline">{o.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {o.company?.nome ?? "—"}
                        </div>
                      </Link>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium">{formatEUR(Number(o.estimated_fee))}</div>
                        <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={`h-1.5 w-1.5 rounded-full ${stage?.color}`} />
                          {stage ? t(`stage.${stage.value}`) : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("overview.draftQuotesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {draftQuotes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <FileText className="h-6 w-6 opacity-50" />
                <span>{t("overview.draftQuotesEmpty")}</span>
              </div>
            ) : (
              <ul className="divide-y">
                {draftQuotes.map((q) => {
                  const status = QUOTE_STATUSES.find((s) => s.value === q.quote_status);
                  return (
                    <li key={q.id} className="flex items-center justify-between gap-3 py-2">
                      <Link
                        to="/crm/quotes/$quoteId"
                        params={{ quoteId: q.id }}
                        className="flex-1 min-w-0"
                      >
                        <div className="font-medium text-sm truncate hover:underline">{q.titulo}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {q.company?.nome ?? q.opportunity?.name ?? "—"}
                        </div>
                      </Link>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium">{formatEUR(Number(q.valor))}</div>
                        <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={`h-1.5 w-1.5 rounded-full ${status?.color}`} />
                          {status ? t(`quoteStatus.${status.value}`) : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
