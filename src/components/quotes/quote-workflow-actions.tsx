/**
 * Quote workflow actions — exposes the canonical Draft → Sent → Approved
 * → Convert path as primary buttons in the quote header. The Status select
 * in Overview remains as a manual/admin fallback.
 *
 * Each transition prompts for confirmation and is performed via a single
 * fee_proposals UPDATE, after which the surrounding query cache is
 * invalidated so opportunity stage and quote header refresh together.
 *
 * "Convert to project" is delegated back to the parent through onConvert
 * because conversion is a multi-table operation already implemented in the
 * route. We only gate it on quote_status === "approved".
 */
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle2, XCircle, Rocket, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteStatus } from "@/lib/crm/types";

type Props = {
  quoteId: string;
  status: QuoteStatus;
  hasAccount: boolean;
  hasProject: boolean;
  onConvert: () => void;
  isConverting?: boolean;
};

export function QuoteWorkflowActions({
  quoteId,
  status,
  hasAccount,
  hasProject,
  onConvert,
  isConverting,
}: Props) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();

  const setStatus = useMutation({
    mutationFn: async (next: QuoteStatus) => {
      const { error } = await supabase
        .from("fee_proposals")
        .update({ quote_status: next })
        .eq("id", quoteId);
      if (error) throw new Error(error.message);
      return next;
    },
    onSuccess: (next) => {
      toast.success(t(`quotes.workflow.toast.${next}`));
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transition = (next: QuoteStatus, confirmKey: string) => {
    if (!confirm(t(confirmKey))) return;
    setStatus.mutate(next);
  };

  // Helper: unified primary CTA per status.
  if (hasProject) {
    return (
      <Button size="sm" variant="secondary" onClick={onConvert} disabled={isConverting}>
        <ExternalLink className="h-4 w-4 mr-1" />
        {t("quotes.workflow.openProject")}
      </Button>
    );
  }

  if (status === "draft") {
    return (
      <Button
        size="sm"
        onClick={() => transition("sent", "quotes.workflow.confirm.send")}
        disabled={setStatus.isPending}
      >
        <Send className="h-4 w-4 mr-1" />
        {t("quotes.workflow.send")}
      </Button>
    );
  }

  if (status === "sent") {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (!hasAccount) {
              toast.error(t("quotes.approveAccountRequired"));
              return;
            }
            transition("approved", "quotes.workflow.confirm.approve");
          }}
          disabled={setStatus.isPending}
          title={!hasAccount ? t("quotes.approveAccountRequired") : undefined}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          {t("quotes.workflow.approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => transition("rejected", "quotes.workflow.confirm.lost")}
          disabled={setStatus.isPending}
        >
          <XCircle className="h-4 w-4 mr-1" />
          {t("quotes.workflow.markLost")}
        </Button>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <Button size="sm" onClick={onConvert} disabled={isConverting}>
        <Rocket className="h-4 w-4 mr-1" />
        {t("quotes.workflow.convert")}
      </Button>
    );
  }

  // status === "rejected" — terminal, no primary CTA, just a passive label.
  return (
    <span className="inline-flex items-center gap-1 text-xs text-destructive">
      <XCircle className="h-3 w-3" />
      {t("quotes.workflow.lostState")}
    </span>
  );
}
