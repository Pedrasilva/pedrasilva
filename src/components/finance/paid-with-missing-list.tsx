/**
 * Confirmed documents marked "Pago — meio por identificar" that still have no
 * "Pago com" 30 days later (bank reconciliation fills it when it matches).
 * RLS scopes the list to the current finance entity.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PaidWithMissingList() {
  const { t } = useTranslation(["finance"]);
  const q = useQuery({
    queryKey: ["finance", "paid-with-missing-30d"],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("financial_documents")
        .select("id, issue_date, total_inc_vat, counterparty_name_snapshot, document_number")
        .eq("paid_method_unknown", true)
        .is("paid_from_card_id", null)
        .is("paid_from_account_id", null)
        .neq("status", "cancelled")
        .lt("created_at", cutoff)
        .order("issue_date", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = q.data ?? [];
  if (!rows.length) return null;
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t("finance:paidMissing.title", { count: rows.length })}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("finance:paidMissing.hint")}</p>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rows.map((r) => (
          <Link key={r.id} to="/finance/documents/$documentId" params={{ documentId: r.id }}
            className="flex justify-between gap-4 rounded px-2 py-1 hover:bg-muted">
            <span>{r.issue_date} · {r.counterparty_name_snapshot ?? "—"} {r.document_number ? `· ${r.document_number}` : ""}</span>
            <span className="tabular-nums">{Number(r.total_inc_vat ?? 0).toFixed(2)} €</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
