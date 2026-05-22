import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Rocket, FileCheck2, Wallet, Workflow, ExternalLink, FileText, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuoteProposalTab } from "@/components/quotes/quote-proposal-tab";

/**
 * Step 3 — Preview & Publish placeholder.
 *
 * Surface ONLY: it shows a soft summary of completion signals plus a hint
 * pointing at the existing header workflow actions (Send / Approve /
 * Convert) and the existing proposal document. NO publishing logic is
 * implemented or moved here in this phase.
 */
export function QuotePublishStep({
  quoteId,
  estimateReady,
  contentReady,
  paymentReady,
  hasProject,
  projectId,
  pricingMultiplier,
  title,
  description,
  clientName,
  accountName,
  quoteType,
  quoteCategory,
  ontologyFamilyCode,
  onEditEstimate,
  onEditContent,
}: {
  quoteId: string;
  estimateReady: boolean;
  contentReady: boolean;
  paymentReady: boolean;
  hasProject: boolean;
  projectId: string | null;
  pricingMultiplier: number;
  title: string;
  description: string | null;
  clientName: string | null;
  accountName: string | null;
  quoteType?: string | null;
  quoteCategory?: "project" | "time_based" | "retainer" | "consultancy" | null;
  ontologyFamilyCode?: string | null;
  onEditEstimate: () => void;
  onEditContent: () => void;
}) {
  const { t } = useTranslation("crm");

  const checks: { key: string; ok: boolean; icon: typeof Workflow }[] = [
    { key: "estimate", ok: estimateReady, icon: Workflow },
    { key: "payment", ok: paymentReady, icon: Wallet },
    { key: "content", ok: contentReady, icon: FileCheck2 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            {t("workspace.publish.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("workspace.publish.description")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onEditEstimate}>
              <Calculator className="mr-1 h-4 w-4" />
              {t("workspace.publish.editEstimate")}
            </Button>
            <Button size="sm" variant="outline" onClick={onEditContent}>
              <FileText className="mr-1 h-4 w-4" />
              {t("workspace.publish.editContent")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("workspace.publish.headerActionsHint")}
          </p>
          {hasProject && projectId && (
            <Link
              to="/projects/$projectId"
              params={{ projectId }}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted/50"
            >
              <ExternalLink className="h-3 w-3" />
              {t("quotes.openProject")}
            </Link>
          )}
        </CardContent>
        </Card>

        <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.publish.readinessTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {checks.map(({ key, ok, icon: Icon }) => (
              <li key={key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border",
                    ok
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-muted-foreground/30 bg-background text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">
                    {t(`workspace.publish.checks.${key}.label`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      `workspace.publish.checks.${key}.${ok ? "ok" : "todo"}`,
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("workspace.publish.softWarningHint")}
          </p>
          <span className="sr-only">{quoteId}</span>
        </CardContent>
        </Card>
      </div>

      <QuoteProposalTab
        quoteId={quoteId}
        pricingMultiplier={pricingMultiplier}
        title={title}
        description={description}
        clientName={clientName}
        accountName={accountName}
        quoteType={quoteType}
        quoteCategory={quoteCategory}
        ontologyFamilyCode={ontologyFamilyCode}
        initialMode="preview"
        showAssemblyTools={false}
      />
    </div>
  );
}
