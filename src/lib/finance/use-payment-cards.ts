import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Payment cards of the current finance entity (RLS scopes them). Only last 4 digits are stored. */
export type PaymentCard = {
  id: string;
  entity_id: string;
  holder_name: string | null;
  collaborator_id: string | null;
  last4: string | null;
  network: "visa" | "mastercard" | "other";
  card_type: "debit" | "credit";
  bank: string | null;
  bank_account_id: string | null;
  bank_refs: string[];
  active: boolean;
  notes: string | null;
};

export const PAYMENT_CARDS_KEY = ["finance", "payment-cards"] as const;

export function usePaymentCards() {
  return useQuery({
    queryKey: PAYMENT_CARDS_KEY,
    queryFn: async (): Promise<PaymentCard[]> => {
      const { data, error } = await supabase
        .from("payment_cards")
        .select("*")
        .order("active", { ascending: false })
        .order("holder_name");
      if (error) throw error;
      return (data ?? []) as PaymentCard[];
    },
  });
}

export type AccountLite = {
  id: string;
  account_name: string;
  bank_name: string | null;
  account_kind: string | null;
  settles_from_account_id: string | null;
  archived_at: string | null;
};

export function useAccountsLite() {
  return useQuery({
    queryKey: ["finance", "accounts-lite"],
    queryFn: async (): Promise<AccountLite[]> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, account_name, bank_name, account_kind, settles_from_account_id, archived_at")
        .order("account_name");
      if (error) throw error;
      return (data ?? []) as AccountLite[];
    },
  });
}

export function cardLabel(c: PaymentCard, unknown: string) {
  return `${c.holder_name || unknown} · ${c.last4 ? `…${c.last4}` : "…????"}`;
}
