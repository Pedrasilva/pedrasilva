import type { QuoteLifecycle } from "@/lib/quotes/quote-lifecycle";
import { canConvertQuote } from "@/lib/quotes/quote-lifecycle";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, FolderPlus } from "lucide-react";
import { QuoteDocumentsCard } from "@/components/crm/opportunity-documents-card";
import { QuoteSignatureCard } from "@/components/quotes/quote-signature-card";
import { QuoteCreateContractCard } from "@/components/quotes/quote-create-contract-card";
import type { QuoteStatus } from "@/lib/crm/types";

/**
 * Step 3 — Convert to project.
 * Surfaces the convert-to-project action once the quote is approved,
 * Contracts record signatures; project creation always stays on the quote.
 */
export function QuotePublishStep({
  quoteId,
  lifecycle,
  hasProject,
  projectId,
  quoteStatus,
  isSigned = false,
  canOverrideSignature = false,
  onConvert,
  isConverting,
  onEditEstimate,
  onEditContent,
}: {
  quoteId: string;
  lifecycle?: QuoteLifecycle;
  estimateReady?: boolean;
  contentReady?: boolean;
  paymentReady?: boolean;
  hasProject: boolean;
  projectId: string | null;
  pricingMultiplier?: number;
  title?: string;
  description?: string | null;
  clientName?: string | null;
  accountName?: string | null;
  quoteType?: string | null;
  quoteCategory?: "project" | "time_based" | "retainer" | "consultancy" | null;
  ontologyFamilyCode?: string | null;
  quoteStatus: QuoteStatus;
  /** fee_proposals.signed_at is set (DocuSign or manual). */
  isSigned?: boolean;
  /** Admins may convert without a recorded signature. */
  canOverrideSignature?: boolean;
  onConvert: () => void;
  isConverting?: boolean;
  onEditEstimate?: () => void;
  onEditContent?: () => void;
}) {
  const { t } = useTranslation("crm");

  const isApproved = quoteStatus === "approved";
  const convertBlocked = !canConvertQuote(lifecycle?.state ?? (isApproved ? "approved" : "draft"));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("quotes.flow.currentState",{state:t(`quotes.lifecycle.${lifecycle?.state ?? "draft"}`)})}</p>
      {!hasProject && (
        <QuoteSignatureCard
          quoteId={quoteId}
          quoteStatus={quoteStatus}
          onEditContent={onEditContent}
        />
      )}
      {isApproved && !isSigned && <p className="text-sm text-amber-700">{t("quotes.flow.unsignedWarning")}</p>}
      {isApproved && !isSigned && <QuoteCreateContractCard quoteId={quoteId} quoteStatus={quoteStatus} />}
      {(
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
            ) : (
              <>
                <p className="text-muted-foreground">
                  {convertBlocked
                    ? t("workspace.publish.convert.acceptanceFirst")
                    : t("workspace.publish.convert.directHint")}
                </p>
                <Button size="sm" onClick={onConvert} disabled={isConverting || convertBlocked}>
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
      {/* Sent + countersigned documents for this quote — the checkpoint the
          step's name promises, reusing the CRM documents surface. */}
      <QuoteDocumentsCard quoteId={quoteId} />
    </div>
  );
}
