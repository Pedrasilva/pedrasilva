/**
 * Bank-side "Match to HR reimbursement" dialog.
 *
 * Lists unpaid Finance expense items linked to HR benefit reimbursements.
 * The reimbursement supplier is resolved via the stable
 * `is_reimbursement_supplier` marker (RPC `get_reimbursement_supplier_id`)
 * — never by display name. Settlement goes through the
 * `finance_settle_expense` SECURITY DEFINER RPC — no client-side
 * cross-table writes.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AMOUNT_TOLERANCE = 0.5; // €
const DAY_WINDOW = 30;

type BankTxLite = {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
};

type Candidate = {
  fei_id: string;
  description: string | null;
  due_date: string | null;
  amount: number;
  paid_so_far: number;
  outstanding: number;
  collaborator_name: string | null;
  category_name: string | null;
};

type Props = {
  tx: BankTxLite;
  onClose: () => void;
  onMatched?: () => void;
};

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

export function MatchBankTxToReimbursementDialog({ tx, onClose, onMatched }: Props) {
  const { t } = useTranslation(["finance", "common"]);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const txAbs = Math.abs(tx.amount);
  const isOutflow = tx.amount < 0; // reimbursements should be money out

  const candidatesQ = useQuery({
    queryKey: ["reimb-candidates", tx.id, txAbs],
    enabled: isOutflow,
    queryFn: async (): Promise<Candidate[]> => {
      // 1. find supplier id via stable marker (RPC)
      const { data: supId, error: supErr } = await supabase.rpc(
        "get_reimbursement_supplier_id",
      );
      if (supErr) throw supErr;
      if (!supId) {
        toast.error(t("finance:bankRec.reimbursement.noSupplier"));
        return [];
      }

      // 2. fetch confirmed reimbursement FEIs
      const { data: feis, error: feiErr } = await supabase
        .from("financial_expense_items")
        .select(
          "id, description, due_date, actual_amount_inc_vat, amount_inc_vat, amount_ex_vat, source_ref_id",
        )
        .eq("source_ref_table", "benefit_expenses")
        .eq("supplier_id", sup.id)
        .eq("status", "confirmed")
        .limit(500);
      if (feiErr) throw feiErr;

      const rows = (feis ?? []) as Array<{
        id: string;
        description: string | null;
        due_date: string | null;
        actual_amount_inc_vat: number | null;
        amount_inc_vat: number | null;
        amount_ex_vat: number | null;
        source_ref_id: string | null;
      }>;

      // 3. payments per FEI
      const ids = rows.map((r) => r.id);
      const paidMap = new Map<string, number>();
      if (ids.length > 0) {
        const { data: pays } = await supabase
          .from("financial_expense_payments")
          .select("expense_item_id, amount")
          .in("expense_item_id", ids);
        for (const p of (pays ?? []) as Array<{ expense_item_id: string; amount: number }>) {
          paidMap.set(
            p.expense_item_id,
            (paidMap.get(p.expense_item_id) ?? 0) + Number(p.amount),
          );
        }
      }

      // 4. HR benefit info (collaborator + category)
      const beIds = rows.map((r) => r.source_ref_id).filter(Boolean) as string[];
      const beMap = new Map<
        string,
        { collaborator_id: string | null; category_id: string | null; descricao: string | null }
      >();
      if (beIds.length > 0) {
        const { data: bes } = await supabase
          .from("benefit_expenses")
          .select("id, collaborator_id, category_id, descricao")
          .in("id", beIds);
        for (const b of (bes ?? []) as Array<{
          id: string;
          collaborator_id: string | null;
          category_id: string | null;
          descricao: string | null;
        }>) {
          beMap.set(b.id, {
            collaborator_id: b.collaborator_id,
            category_id: b.category_id,
            descricao: b.descricao,
          });
        }
      }

      const collabIds = Array.from(
        new Set(Array.from(beMap.values()).map((b) => b.collaborator_id).filter(Boolean) as string[]),
      );
      const collabMap = new Map<string, string>();
      if (collabIds.length > 0) {
        const { data: cols } = await supabase
          .from("collaborators")
          .select("id, nome")
          .in("id", collabIds);
        for (const c of (cols ?? []) as Array<{ id: string; nome: string }>) {
          collabMap.set(c.id, c.nome);
        }
      }

      const catIds = Array.from(
        new Set(Array.from(beMap.values()).map((b) => b.category_id).filter(Boolean) as string[]),
      );
      const catMap = new Map<string, string>();
      if (catIds.length > 0) {
        const { data: cats } = await supabase
          .from("benefit_categories")
          .select("id, label_pt")
          .in("id", catIds);
        for (const c of (cats ?? []) as Array<{ id: string; label_pt: string }>) {
          catMap.set(c.id, c.label_pt);
        }
      }

      // 5. build candidate list with filtering
      const txTime = new Date(tx.transaction_date).getTime();
      const windowMs = DAY_WINDOW * 86400 * 1000;

      return rows
        .map((r) => {
          const expected = Number(
            r.actual_amount_inc_vat ?? r.amount_inc_vat ?? r.amount_ex_vat ?? 0,
          );
          const paid = paidMap.get(r.id) ?? 0;
          const outstanding = Math.max(0, expected - paid);
          const be = r.source_ref_id ? beMap.get(r.source_ref_id) : undefined;
          return {
            fei_id: r.id,
            description: be?.descricao ?? r.description,
            due_date: r.due_date,
            amount: expected,
            paid_so_far: paid,
            outstanding,
            collaborator_name: be?.collaborator_id
              ? collabMap.get(be.collaborator_id) ?? null
              : null,
            category_name: be?.category_id ? catMap.get(be.category_id) ?? null : null,
          } as Candidate;
        })
        .filter((c) => c.outstanding > 0)
        .filter((c) => Math.abs(c.outstanding - txAbs) <= AMOUNT_TOLERANCE)
        .filter((c) => {
          if (!c.due_date) return true;
          const dt = new Date(c.due_date).getTime();
          return Math.abs(dt - txTime) <= windowMs;
        })
        .sort((a, b) => Math.abs(a.outstanding - txAbs) - Math.abs(b.outstanding - txAbs))
        .slice(0, 25);
    },
  });

  async function settle(c: Candidate) {
    setSettlingId(c.fei_id);
    try {
      const { error } = await supabase.rpc("finance_settle_expense", {
        p_expense_item_id: c.fei_id,
        p_bank_transaction_id: tx.id,
        p_amount: c.outstanding,
        p_payment_date: tx.transaction_date,
      });
      if (error) throw error;
      toast.success(t("finance:bankRec.reimbursement.settled", { defaultValue: "Reembolso liquidado" }));
      onMatched?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSettlingId(null);
    }
  }

  const candidates = useMemo(() => candidatesQ.data ?? [], [candidatesQ.data]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("finance:bankRec.reimbursement.title", {
              defaultValue: "Match to HR reimbursement",
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("finance:bankRec.col.date")}</span>
              <span>{tx.transaction_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("finance:bankRec.col.description")}
              </span>
              <span className="truncate max-w-[60%]" title={tx.description}>
                {tx.description}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("finance:documents.bankMatch.txAmount")}
              </span>
              <span className="tabular-nums font-medium">{fmtEUR(tx.amount)}</span>
            </div>
          </div>

          {!isOutflow ? (
            <p className="text-sm text-muted-foreground">
              {t("finance:bankRec.reimbursement.onlyOutflow", {
                defaultValue: "Reimbursements are outflows. Pick a money-out transaction.",
              })}
            </p>
          ) : candidatesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("finance:bankRec.reimbursement.noCandidates", {
                defaultValue:
                  "No matching reimbursements (±0.50 €, ±30 days from this transaction).",
              })}
            </p>
          ) : (
            <div className="border rounded-md divide-y max-h-[420px] overflow-auto">
              {candidates.map((c) => {
                const isPartial = c.paid_so_far > 0;
                return (
                  <div key={c.fei_id} className="p-3 flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <UserRound className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{c.collaborator_name ?? "—"}</span>
                        {c.category_name ? (
                          <Badge variant="outline" className="text-[10px]">
                            {c.category_name}
                          </Badge>
                        ) : null}
                      </div>
                      {c.description ? (
                        <div className="text-xs text-muted-foreground truncate">
                          {c.description}
                        </div>
                      ) : null}
                      <div className="text-xs text-muted-foreground flex gap-3">
                        <span>{c.due_date ?? "—"}</span>
                        <span className="tabular-nums">{fmtEUR(c.outstanding)}</span>
                        {isPartial ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("finance:bankRec.reimbursement.partial", {
                              defaultValue: "Partial",
                              paid: fmtEUR(c.paid_so_far),
                            })}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => settle(c)}
                      disabled={settlingId !== null}
                    >
                      {settlingId === c.fei_id ? (
                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                      ) : null}
                      {t("finance:bankRec.reimbursement.settle", { defaultValue: "Settle" })}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common:close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
