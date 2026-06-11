/**
 * Quote workflow actions — exposes the canonical Draft → Sent → Approved
 * path as primary buttons in the quote header. The Status select in
 * Overview remains as a manual/admin fallback.
 *
 * IMPORTANT: This header NEVER renders a "Convert to project" button.
 * Conversion is a separate, destructive operation that lives in the
 * dedicated Convert card on the Overview tab. Keeping it out of the
 * header prevents two failure modes:
 *   1. Focus-bleed: after the Approve confirmation closes, the same
 *      DOM position would mount a Convert button — Enter/space would
 *      re-fire and prompt for conversion.
 *   2. Visual confusion: an Approve click should never look like it
 *      can also create a project shell.
 *
 * Each transition uses an AlertDialog (shadcn) instead of the native
 * `confirm()` dialog so the messages cannot accidentally chain across
 * status changes, and so the dialog state is fully owned by React.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Send, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteStatus } from "@/lib/crm/types";

type Props = {
  quoteId: string;
  status: QuoteStatus;
  hasAccount: boolean;
  hasProject: boolean;
  companyId: string | null;
  defaultContactId?: string | null;
  onConvert: () => void;
  onApproved?: () => void;
  isConverting?: boolean;
};

type PendingTransition = {
  next: QuoteStatus;
  titleKey: string;
  descKey: string;
  confirmKey: string;
} | null;

export function QuoteWorkflowActions({
  quoteId,
  status,
  hasAccount,
  hasProject,
  companyId,
  defaultContactId,
  onConvert,
  onApproved,
  isConverting,
}: Props) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingTransition>(null);
  const [approverId, setApproverId] = useState<string>("");

  const collaboratorsQ = useQuery({
    queryKey: ["collaborators-for-approval"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, nome")
        .is("archived_at", null)
        .order("nome")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (pending?.next === "approved" && !approverId) {
      setApproverId(defaultContactId ?? "");
    }
  }, [pending, defaultContactId, approverId]);

  const setStatus = useMutation({
    mutationFn: async (payload: { next: QuoteStatus; approverId?: string | null }) => {
      const updates: Partial<{
        quote_status: QuoteStatus;
        approved_by_collaborator_id: string | null;
        approved_at: string | null;
      }> = { quote_status: payload.next };
      if (payload.next === "approved") {
        updates.approved_by_collaborator_id = payload.approverId ?? null;
        updates.approved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("fee_proposals")
        .update(updates)
        .eq("id", quoteId);
      if (error) throw new Error(error.message);
      return payload.next;
    },
    onSuccess: (next) => {
      toast.success(t(`quotes.workflow.toast.${next}`));
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
      if (next === "approved") onApproved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const askApprove = () => {
    setPending({
      next: "approved",
      titleKey: "quotes.workflow.dialog.approveTitle",
      descKey: hasAccount
        ? "quotes.workflow.dialog.approveDesc"
        : "quotes.workflow.dialog.approveNoAccountDesc",
      confirmKey: "quotes.workflow.dialog.approveConfirmCta",
    });
  };

  const askSend = () => {
    setPending({
      next: "sent",
      titleKey: "quotes.workflow.dialog.sendTitle",
      descKey: "quotes.workflow.dialog.sendDesc",
      confirmKey: "quotes.workflow.dialog.sendConfirmCta",
    });
  };

  const askLost = () => {
    setPending({
      next: "rejected",
      titleKey: "quotes.workflow.dialog.lostTitle",
      descKey: "quotes.workflow.dialog.lostDesc",
      confirmKey: "quotes.workflow.dialog.lostConfirmCta",
    });
  };

  const onConfirm = () => {
    if (!pending) return;
    const next = pending.next;
    setPending(null);
    setStatus.mutate({ next, approverId: next === "approved" ? (approverId || null) : null });
    // Move focus to a neutral element AFTER Radix returns focus to the
    // trigger. Without this, focus can bleed onto the next enabled button
    // in tab order (e.g. the Convert to Project button which becomes
    // enabled the instant status flips to "approved"), and a held/queued
    // Enter keypress would then trigger that button — opening the convert
    // confirmation as a visible side-effect of approval.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active && typeof active.blur === "function") active.blur();
        if (typeof document !== "undefined" && document.body) {
          document.body.focus?.();
        }
      });
    });
  };

  // Already converted → only show "open project" shortcut.
  if (hasProject) {
    return (
      <Button size="sm" variant="secondary" onClick={onConvert} disabled={isConverting}>
        <ExternalLink className="h-4 w-4 mr-1" />
        {t("quotes.workflow.openProject")}
      </Button>
    );
  }

  let primary: React.ReactNode = null;

  if (status === "draft") {
    primary = (
      <Button size="sm" onClick={askSend} disabled={setStatus.isPending}>
        <Send className="h-4 w-4 mr-1" />
        {t("quotes.workflow.send")}
      </Button>
    );
  } else if (status === "sent") {
    primary = (
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={askApprove} disabled={setStatus.isPending}>
          <CheckCircle2 className="h-4 w-4 mr-1" />
          {t("quotes.workflow.approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={askLost}
          disabled={setStatus.isPending}
        >
          <XCircle className="h-4 w-4 mr-1" />
          {t("quotes.workflow.markLost")}
        </Button>
      </div>
    );
  } else if (status === "approved") {
    // Header shows a passive label only. Conversion lives in the Convert
    // card (Overview tab) so the Approve click cannot bleed into a
    // Convert prompt via focus / repeated Enter.
    primary = (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        {t("quotes.workflow.approvedState")}
      </span>
    );
  } else {
    // status === "rejected" — terminal, passive label.
    primary = (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <XCircle className="h-3 w-3" />
        {t("quotes.workflow.lostState")}
      </span>
    );
  }

  return (
    <>
      {primary}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? t(pending.titleKey) : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? t(pending.descKey) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending?.next === "approved" && (
            <div className="space-y-2">
              <Label>{t("quotes.workflow.dialog.approverLabel")}</Label>
              <Select value={approverId} onValueChange={setApproverId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("quotes.workflow.dialog.approverPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {(collaboratorsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
            >
              {pending ? t(pending.confirmKey) : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
