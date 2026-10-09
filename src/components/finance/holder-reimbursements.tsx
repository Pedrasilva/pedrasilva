/**
 * "A reembolsar": PSA expenses paid with a personal card, owed to the card
 * holder until someone marks them repaid. Rows are created by the database
 * when the personal-card decision is "PSA expense paid by the holder".
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KEY = ["finance", "holder-reimbursements"] as const;
const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

type Row = { id: string; document_id: string; holder_name: string | null; amount: number; status: string; repaid_at: string | null; created_at: string };

function useReimbursements() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("finance_holder_reimbursements")
        .select("id, document_id, holder_name, amount, status, repaid_at, created_at")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

function useSetStatus() {
  const qc = useQueryClient();
  const { t } = useTranslation(["finance"]);
  return async (id: string, status: "owed" | "repaid") => {
    const { error } = await supabase.from("finance_holder_reimbursements").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t(status === "repaid" ? "finance:holderReimb.markedRepaid" : "finance:holderReimb.markedOwed"));
    qc.invalidateQueries({ queryKey: KEY });
  };
}

export function HolderReimbursementsCard() {
  const { t } = useTranslation(["finance"]);
  const q = useReimbursements();
  const setStatus = useSetStatus();
  const rows = q.data ?? [];
  const owed = new Map<string, number>();
  for (const r of rows) if (r.status === "owed") owed.set(r.holder_name ?? "—", (owed.get(r.holder_name ?? "—") ?? 0) + Number(r.amount));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("finance:holderReimb.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("finance:holderReimb.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {owed.size > 0 && (
          <div className="flex flex-wrap gap-2">
            {[...owed].map(([h, v]) => (
              <Badge key={h} variant="secondary">{t("finance:holderReimb.owedTo", { holder: h, amount: eur(v) })}</Badge>
            ))}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("finance:holderReimb.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance:cards.holder")}</TableHead>
                <TableHead>{t("finance:holderReimb.document")}</TableHead>
                <TableHead className="text-right">{t("finance:holderReimb.amount")}</TableHead>
                <TableHead>{t("finance:holderReimb.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.holder_name ?? "—"}</TableCell>
                  <TableCell>
                    <Link to="/finance/documents/$documentId" params={{ documentId: r.document_id }} className="underline">
                      {t("finance:holderReimb.open")}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{eur(Number(r.amount))}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "owed" ? "destructive" : "outline"}>{t(`finance:holderReimb.st.${r.status}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "owed" ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "repaid")}>{t("finance:holderReimb.markRepaid")}</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "owed")}>{t("finance:holderReimb.undoRepaid")}</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact status for one document (shown under the personal-card decision). */
export function DocumentHolderReimbursement({ documentId }: { documentId: string }) {
  const { t } = useTranslation(["finance"]);
  const q = useReimbursements();
  const setStatus = useSetStatus();
  const r = q.data?.find((x) => x.document_id === documentId);
  if (!r) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={r.status === "owed" ? "destructive" : "outline"}>
        {r.status === "owed"
          ? t("finance:holderReimb.owedTo", { holder: r.holder_name ?? "—", amount: eur(Number(r.amount)) })
          : t("finance:holderReimb.st.repaid")}
      </Badge>
      {r.status === "owed" && (
        <Button size="sm" variant="outline" className="h-7" onClick={() => setStatus(r.id, "repaid")}>{t("finance:holderReimb.markRepaid")}</Button>
      )}
    </div>
  );
}

export const HOLDER_REIMB_KEY = KEY;
