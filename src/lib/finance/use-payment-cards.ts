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
  device_last4: { last4: string; label?: string | null }[];
  is_personal: boolean;
};

export function devicesToText(d: PaymentCard["device_last4"]) {
  return (d ?? []).map((x) => (x.label ? `${x.last4}:${x.label}` : x.last4)).join(", ");
}

export function textToDevices(s: string): PaymentCard["device_last4"] {
  return s.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [n, ...rest] = p.split(":");
    return { last4: n.replace(/\D/g, "").slice(-4), label: rest.join(":").trim() || null };
  }).filter((x) => x.last4.length === 4);
}

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
