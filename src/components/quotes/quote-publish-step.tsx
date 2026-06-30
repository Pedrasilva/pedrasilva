import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  FileCheck2,
  Wallet,
  Workflow,
  ExternalLink,
  FileText,
  Calculator,
  FolderPlus,
  FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuoteProposalTab } from "@/components/quotes/quote-proposal-tab";
import { useContractsByQuote } from "@/lib/contracts";
import type { QuoteStatus } from "@/lib/crm/types";

/**
 * Step 3 — Preview & Publish.
 *
 * Shows readiness signals, surfaces the convert-to-project action once
 * the quote is approved, and links to a signed contract's bootstrap flow
 * when one exists.
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
  quoteStatus,
  onConvert,
  isConverting,
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
  quoteStatus: QuoteStatus;
  onConvert: () => void;
  isConverting?: boolean;
  onEditEstimate: () => void;
  onEditContent: () => void;
}) {
  const { t } = useTranslation("crm");

  const { data: contracts = [] } = useContractsByQuote(quoteId);
  const signedContract = contracts.find((c) => c.status === "signed") ?? null;

  const checks: { key: string; ok: boolean; icon: typeof Workflow }[] = [
    { key: "estimate", ok: estimateReady, icon: Workflow },
    { key: "payment", ok: paymentReady, icon: Wallet },
    { key: "content", ok: contentReady, icon: FileCheck2 },
  ];

  const isApproved = quoteStatus === "approved";
  const showConvertCard = isApproved || hasProject;

  return (
    <div className="space-y-4">
      {showConvertCard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderPlus className="h-4 w-4 text-primary" />
              {t("workspace.publish.convert.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {hasProject && projectId ? (
              <>
                <p className="text-muted-foreground">
                  {t("workspace.publish.convert.alreadyConverted")}
                </p>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId }}
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted/50"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("quotes.openProject")}
                </Link>
              </>
            ) : signedContract ? (
              <>
                <p className="text-muted-foreground">
                  {t("workspace.publish.convert.viaContractHint")}
                </p>
                <Link
                  to="/crm/contracts/$contractId"
                  params={{ contractId: signedContract.id }}
                  className="inline-flex items-center gap-1 rounded-md border bg-primary text-primary-foreground px-3 py-1.5 text-xs hover:opacity-90"
                >
                  <FileSignature className="h-3 w-3" />
                  {t("workspace.publish.convert.openContractCta")}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {t("workspace.publish.convert.directFallbackHint")}
                </p>
                <Button size="sm" variant="outline" onClick={onConvert} disabled={isConverting}>
                  <FolderPlus className="mr-1 h-4 w-4" />
                  {isConverting
                    ? t("workspace.publish.convert.converting")
                    : t("workspace.publish.convert.directCta")}
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {t("workspace.publish.convert.directHint")}
                </p>
                <Button size="sm" onClick={onConvert} disabled={isConverting}>
                  <FolderPlus className="mr-1 h-4 w-4" />
                  {isConverting
                    ? t("workspace.publish.convert.converting")
                    : t("workspace.publish.convert.directCta")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <span className="sr-only">{quoteId}</span>
    </div>
  );
}

