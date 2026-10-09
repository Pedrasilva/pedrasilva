/**
 * "Paid with": one card OR one account (never both) on a document, review item
 * or expense. Shows an unknown card number as "Cartão desconhecido …1234" so
 * someone adds it, and offers the supplier's usual card as a suggestion only.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentHolderReimbursement, HOLDER_REIMB_KEY } from "@/components/finance/holder-reimbursements";
import { cardLabel, useAccountsLite, usePaymentCards } from "@/lib/finance/use-payment-cards";

export type PaidWith = { cardId: string | null; accountId: string | null };

type Props = {
  value: PaidWith;
  onChange: (v: PaidWith) => void;
  last4?: string | null;
  supplierId?: string | null;
  disabled?: boolean;
};

export function PaidWithSelect({ value, onChange, last4, supplierId, disabled }: Props) {
  const { t } = useTranslation(["finance"]);
  const cards = usePaymentCards();
  const accounts = useAccountsLite();
  const usual = useQuery({
    queryKey: ["finance", "supplier-usual-card", supplierId],
    enabled: !!supplierId && !value.cardId && !value.accountId,
    queryFn: async () => {
      const { data } = await supabase.rpc("fin_supplier_usual_card", { _supplier: supplierId! });
      return (data as string | null) ?? null;
    },
  });
  const unknownHolder = t("finance:cards.unknownHolder");
  const activeCards = (cards.data ?? []).filter((c) => c.active || c.id === value.cardId);
  const known = !last4 || (cards.data ?? []).some((c) => c.last4 === last4);
  const sel = value.cardId ? `card:${value.cardId}` : value.accountId ? `acct:${value.accountId}` : "none";
  const usualCard = usual.data ? (cards.data ?? []).find((c) => c.id === usual.data) : null;

  return (
    <div className="space-y-1.5">
      <Select
        value={sel}
        disabled={disabled}
        onValueChange={(v) =>
          onChange(
            v.startsWith("card:")
              ? { cardId: v.slice(5), accountId: null }
              : v.startsWith("acct:")
                ? { cardId: null, accountId: v.slice(5) }
                : { cardId: null, accountId: null },
          )
        }
      >
        <SelectTrigger><SelectValue placeholder={t("finance:paidWith.none")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("finance:paidWith.none")}</SelectItem>
          {activeCards.map((c) => (
            <SelectItem key={c.id} value={`card:${c.id}`}>
              {t("finance:paidWith.card")}: {cardLabel(c, unknownHolder)}
            </SelectItem>
          ))}
          {(accounts.data ?? []).filter((a) => !a.archived_at || a.id === value.accountId).map((a) => (
            <SelectItem key={a.id} value={`acct:${a.id}`}>
              {t("finance:paidWith.account")}: {a.account_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!known && last4 && (
        <Badge variant="outline" className="text-xs">{t("finance:paidWith.unknownCard", { last4 })}</Badge>
      )}
      {usualCard && !disabled && (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
          onClick={() => onChange({ cardId: usualCard.id, accountId: null })}>
          {t("finance:paidWith.suggestUsual", { card: cardLabel(usualCard, unknownHolder) })}
        </Button>
      )}
    </div>
  );
}

/** Saved-record variant for the document page: writes straight to financial_documents. */
export function DocumentPaidWith({ documentId, disabled }: { documentId: string; disabled?: boolean }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["finance", "doc-paid-with", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_documents")
        .select("paid_from_card_id, paid_from_account_id, card_last4, counterparty_supplier_id, created_by, personal_card_decision")
        .eq("id", documentId)
        .single();
      if (error) throw error;
      let createdByName: string | null = null;
      if (data.created_by) {
        const r = await supabase.rpc("fin_user_display_name", { _user_id: data.created_by });
        createdByName = (r.data as string | null) ?? null;
      }
      return { ...data, createdByName };
    },
  });
  const cards = usePaymentCards();
  if (!q.data) return null;
  const personal = !!q.data.paid_from_card_id && (cards.data ?? []).some((c) => c.id === q.data!.paid_from_card_id && c.is_personal);
  const save = async (v: PaidWith) => {
    const { error } = await supabase
      .from("financial_documents")
      .update({ paid_from_card_id: v.cardId, paid_from_account_id: v.accountId })
      .eq("id", documentId);
    if (error) return toast.error(error.message);
    toast.success(t("finance:paidWith.saved"));
    qc.invalidateQueries({ queryKey: ["finance", "doc-paid-with", documentId] });
  };
  const decide = async (d: string) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("financial_documents")
      .update({ personal_card_decision: d, personal_card_decided_by: u.user?.id ?? null, personal_card_decided_at: new Date().toISOString() })
      .eq("id", documentId);
    if (error) return toast.error(error.message);
    toast.success(t(d === "personal" ? "finance:paidWith.movedToRemoved" : "finance:paidWith.owedRecorded"));
    qc.invalidateQueries({ queryKey: ["finance", "doc-paid-with", documentId] });
    qc.invalidateQueries({ queryKey: HOLDER_REIMB_KEY });
    qc.invalidateQueries({ queryKey: ["finance"] });
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="text-sm font-medium">{t("finance:paidWith.label")}</div>
        <PaidWithSelect
          value={{ cardId: q.data.paid_from_card_id, accountId: q.data.paid_from_account_id }}
          onChange={save}
          last4={q.data.card_last4}
          supplierId={q.data.counterparty_supplier_id}
          disabled={disabled}
        />
        {personal && (
          <div className="space-y-1.5 pt-1">
            <Badge variant="destructive" className="text-xs">{t("finance:paidWith.personalFlag")}</Badge>
            <Select value={q.data.personal_card_decision ?? ""} onValueChange={decide} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder={t("finance:paidWith.decisionPending")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">{t("finance:paidWith.decisionPersonal")}</SelectItem>
                <SelectItem value="psa_paid_by_holder">{t("finance:paidWith.decisionPsa")}</SelectItem>
              </SelectContent>
            </Select>
            <DocumentHolderReimbursement documentId={documentId} />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="text-sm font-medium">{t("finance:enteredBy.label")}</div>
        <div className="text-sm text-muted-foreground">{q.data.createdByName ?? t("finance:enteredBy.automatic")}</div>
      </div>
    </div>
  );
}
