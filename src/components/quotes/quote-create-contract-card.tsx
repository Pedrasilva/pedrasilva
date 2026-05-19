/**
 * Stage 5A — Contract Generator Foundation
 * "Create draft contract" card on the quote workspace Overview tab.
 *
 * - Enabled only when quote is approved.
 * - If a draft already exists, the button routes to it instead of
 *   creating a duplicate (sealed-snapshot rule).
 */
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileSignature, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useContractsByQuote,
  useCreateDraftContractFromQuote,
} from "@/lib/contracts";

type Props = {
  quoteId: string;
  quoteStatus: string;
};

export function QuoteCreateContractCard({ quoteId, quoteStatus }: Props) {
  const { t } = useTranslation("crm");
  const navigate = useNavigate();
  const { data: contracts } = useContractsByQuote(quoteId);
  const create = useCreateDraftContractFromQuote();

  const draft = contracts?.find((c) => c.status === "draft");
  const isApproved = quoteStatus === "approved";

  const handleCreate = () => {
    create.mutate(
      { quoteId },
      {
        onSuccess: (res) => {
          if (res.reusedExistingDraft) {
            toast.info(t("contracts.toast.reusedDraft"));
          } else {
            toast.success(t("contracts.toast.draftCreated"));
          }
          navigate({
            to: "/crm/contracts/$contractId",
            params: { contractId: res.contractId },
          });
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4" />
          {t("contracts.card.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("contracts.card.subtitle")}
        </p>

        {!isApproved && (
          <p className="text-xs text-muted-foreground">
            {t("contracts.card.onlyApproved")}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {draft ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                navigate({
                  to: "/crm/contracts/$contractId",
                  params: { contractId: draft.id },
                })
              }
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              {t("contracts.card.openDraft")}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!isApproved || create.isPending}
              onClick={handleCreate}
            >
              <FileSignature className="h-4 w-4 mr-1" />
              {create.isPending
                ? t("contracts.card.creating")
                : t("contracts.card.createDraft")}
            </Button>
          )}
          {contracts && contracts.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("contracts.card.totalCount", { count: contracts.length })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
