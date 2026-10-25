import uiI18n from "@/i18n/index";
/**
 * Stage B reconciliation helpers:
 *  - PeriodWindowCard: statement figures vs Hub figures for one statement
 *    period, explanations for differences, progress, lock / reopen with reason.
 *  - CandidatePool: one searchable list of everything a movement could match
 *    (purchases, sales, Entrada items, reimbursements, own-account transfers),
 *    searched in the database so nothing is hidden by a row limit.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lock, LockOpen, Search, AlertTriangle, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat(uiI18n.language, { style: "currency", currency: "EUR" }).format(Number(n));

export type PeriodWindow = {
  period_id: string;
  statement_number: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  imported_total: number;
  expected_closing: number;
  difference: number;
  matched_difference: number;
  matched_count: number;
  matched_total: number;
  tx_count: number;
  unmatched_count: number;
  unmatched_total: number;
  duplicate_flagged_count: number;
  previous_closing: number | null;
  continuity_difference: number | null;
  locked_at: string | null;
  gaps: { from: string; to: string }[];
  duplicates: { date: string; amount: number; description: string; count: number }[];
  outside: { id: string; date: string; amount: number; description: string }[];
  card: null | {
    due_date: string | null;
    amount_to_debit: number | null;
    settling_account_id: string | null;
    debit_candidates?: { id: string; date: string; amount: number; description: string; reconciled: boolean }[];
  };
};

/** Lock is allowed only when every movement is resolved and the statement closing is met. */
export function canLockPeriod(w: Pick<PeriodWindow, "unmatched_count" | "matched_difference" | "locked_at">): boolean {
  return !w.locked_at && w.unmatched_count === 0 && Math.abs(Number(w.matched_difference)) <= 0.005;
}

export const periodWindowKey = (id: string) => ["finance", "period-window", id] as const;

export function PeriodWindowCard({ periodId }: { periodId: string }) {
  const { t } = useTranslation(["finance", "common"]);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const q = useQuery({
    queryKey: periodWindowKey(periodId),
    queryFn: async (): Promise<PeriodWindow> => {
      const { data, error } = await supabase.rpc("fin_period_window", { _period_id: periodId });
      if (error) throw error;
      return data as unknown as PeriodWindow;
    },
  });
  const w = q.data;
  if (!w) return null;
  const diff = Number(w.difference);
  const ok = Math.abs(diff) <= 0.005;

  async function lock() {
    const { error } = await supabase.rpc("fin_period_lock", { _period_id: periodId });
    if (error) { toast.error(t(`finance:periodWindow.errors.${error.message}`, { defaultValue: error.message })); return; }
    toast.success(t("finance:periodWindow.locked"));
    qc.invalidateQueries({ queryKey: ["finance"] });
  }
  async function reopen() {
    const { error } = await supabase.rpc("fin_period_reopen", { _period_id: periodId, _reason: reason });
    if (error) { toast.error(t(`finance:periodWindow.errors.${error.message}`, { defaultValue: error.message })); return; }
    toast.success(t("finance:periodWindow.reopened"));
    setReopenOpen(false); setReason("");
    qc.invalidateQueries({ queryKey: ["finance"] });
  }

  const Row = ({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) => (
    <div className="flex justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm">
            {t("finance:periodWindow.title", { number: w.statement_number })} · {w.period_start} → {w.period_end}
          </CardTitle>
          {w.locked_at ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1"><Lock className="size-3" />{t("finance:periodWindow.lockedBadge")}</Badge>
              {isAdmin && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReopenOpen(true)}><LockOpen className="size-3 mr-1" />{t("finance:periodWindow.reopen")}</Button>}
            </div>
          ) : isAdmin ? (
            <Button size="sm" className="h-7 text-xs" disabled={!canLockPeriod(w)} onClick={lock} title={canLockPeriod(w) ? undefined : t("finance:periodWindow.lockHint") as string}>
              <Lock className="size-3 mr-1" />{t("finance:periodWindow.lock")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Row label={t("finance:periodWindow.opening")} value={fmt(w.opening_balance)} />
          <Row label={t("finance:periodWindow.movements", { count: w.tx_count })} value={fmt(w.imported_total)} />
          <Row label={t("finance:periodWindow.expectedClosing")} value={fmt(w.expected_closing)} />
          <Row label={t("finance:periodWindow.statementClosing")} value={fmt(w.closing_balance)} />
          <Row label={t("finance:periodWindow.difference")} value={fmt(diff)} tone={ok ? "ok" : "bad"} />
          {w.continuity_difference != null && Math.abs(Number(w.continuity_difference)) > 0.005 && (
            <p className="text-[11px] text-destructive">{t("finance:periodWindow.continuity", { previous: fmt(w.previous_closing), diff: fmt(w.continuity_difference) })}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Row label={t("finance:periodWindow.progress")} value={t("finance:periodWindow.progressValue", { matched: w.matched_count, total: w.tx_count - w.duplicate_flagged_count })} />
          <Row label={t("finance:periodWindow.unmatchedAmount")} value={fmt(w.unmatched_total)} tone={w.unmatched_count === 0 ? "ok" : undefined} />
          <Row label={t("finance:periodWindow.matchedDifference")} value={fmt(w.matched_difference)} tone={Math.abs(Number(w.matched_difference)) <= 0.005 ? "ok" : "bad"} />
          {(!ok || w.gaps.length > 0 || w.duplicates.length > 0 || w.outside.length > 0) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2 space-y-1 text-[11px]">
              <div className="flex items-center gap-1 font-medium"><AlertTriangle className="size-3" />{t("finance:periodWindow.explanations")}</div>
              {w.gaps.map((g) => <div key={g.from}>{t("finance:periodWindow.gap", { from: g.from, to: g.to })}</div>)}
              {w.duplicates.map((d, i) => <div key={i}>{t("finance:periodWindow.duplicate", { count: d.count, date: d.date, amount: fmt(d.amount), description: d.description })}</div>)}
              {w.outside.map((o) => <div key={o.id}>{t("finance:periodWindow.outside", { date: o.date, amount: fmt(o.amount), description: o.description })}</div>)}
              {!ok && w.gaps.length === 0 && w.duplicates.length === 0 && w.outside.length === 0 && <div>{t("finance:periodWindow.noExplanation")}</div>}
            </div>
          )}
        </div>
        {w.card && (
          <div className="md:col-span-2 rounded-md border p-2 text-xs space-y-1">
            <div className="flex items-center gap-1 font-medium"><CreditCard className="size-3" />{t("finance:periodWindow.cardPayment")}</div>
            <div className="text-muted-foreground">{t("finance:periodWindow.cardDue", { amount: fmt(w.card.amount_to_debit), date: w.card.due_date ?? "—" })}</div>
            {(w.card.debit_candidates ?? []).length === 0 ? (
              <div className="text-destructive">{t("finance:periodWindow.cardNoDebit")}</div>
            ) : (
              (w.card.debit_candidates ?? []).map((c) => (
                <div key={c.id} className="flex justify-between gap-2">
                  <span>{c.date} · {c.description}</span>
                  <span className="tabular-nums">{fmt(c.amount)} {c.reconciled ? `· ${t("finance:periodWindow.reconciled")}` : ""}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("finance:periodWindow.reopenTitle")}</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("finance:periodWindow.reasonPlaceholder") as string} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>{t("common:cancel")}</Button>
            <Button disabled={reason.trim().length < 3} onClick={reopen}>{t("finance:periodWindow.reopen")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export type Candidate = {
  kind: "purchase" | "sale" | "entrada" | "reimbursement" | "transfer";
  ref_id: string;
  label: string;
  counterparty: string | null;
  doc_date: string | null;
  amount: number | null;
  outstanding: number | null;
  detail: string | null;
};

export function CandidatePool({
  txId, txAmount, onMatchDoc, onMatchReimb, onMarkTransfer, onConfirmEntrada,
}: {
  /** Confirm the pending Entrada item and match it in one step (side panel). */
  onConfirmEntrada?: (queueId: string) => void;
  txId: string;
  txAmount: number;
  onMatchDoc: (docId: string) => void;
  onMatchReimb: () => void;
  onMarkTransfer: () => void;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const h = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(h); }, [search]);
  const q = useQuery({
    queryKey: ["finance", "reconcile-candidates", txId, debounced],
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase.rpc("fin_reconcile_candidates", { _tx_id: txId, _search: debounced || undefined });
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });
  const rows = q.data ?? [];
  return (
    <div className="border rounded-md">
      <div className="p-2 border-b flex items-center gap-2">
        <span className="text-xs font-medium shrink-0">{t("finance:candidatePool.title")}</span>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input className="h-7 pl-7 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("finance:candidatePool.search") as string} />
        </div>
      </div>
      <div className="max-h-[320px] overflow-auto divide-y">
        {q.isLoading ? (
          <p className="p-3 text-xs text-muted-foreground">{t("common:loading")}</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">{t("finance:candidatePool.empty")}</p>
        ) : rows.map((c) => {
          const exact = Math.abs(Math.abs(Number(c.outstanding ?? c.amount ?? 0)) - Math.abs(txAmount)) < 0.01;
          return (
            <div key={`${c.kind}-${c.ref_id}`} className="px-2 py-1.5 flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-[10px] shrink-0">{t(`finance:candidatePool.kind.${c.kind}`)}</Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate">{c.label}{c.counterparty ? ` · ${c.counterparty}` : ""}</div>
                <div className="text-[10px] text-muted-foreground">{c.doc_date ?? "—"}{c.detail ? ` · ${c.detail}` : ""}</div>
              </div>
              <span className={`tabular-nums shrink-0 ${exact ? "text-emerald-600 font-medium" : ""}`}>{fmt(c.outstanding ?? c.amount)}</span>
              {c.kind === "purchase" || c.kind === "sale" ? (
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onMatchDoc(c.ref_id)}>{t("finance:candidatePool.match")}</Button>
              ) : c.kind === "reimbursement" ? (
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={onMatchReimb}>{t("finance:candidatePool.match")}</Button>
              ) : c.kind === "transfer" ? (
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={onMarkTransfer}>{t("finance:candidatePool.markTransfer")}</Button>
              ) : onConfirmEntrada ? (
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onConfirmEntrada(c.ref_id)}>{t("finance:reconSuggest.confirmAndMatch")}</Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="h-6 text-[11px]"><Link to="/finance/entrada">{t("finance:candidatePool.openEntrada")}</Link></Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
