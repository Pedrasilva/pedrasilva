import { translateError } from '@/lib/translate-error';
import uiI18n from "@/i18n/index";
/**
 * Stage C reconciliation UI:
 *  - TxSuggestions: ranked top-5 for one movement (confidence + one-line reason).
 *  - EntradaConfirmMatchSheet: confirm a pending Entrada item and match it in one step.
 *  - ReviewSuggestionsDialog: walk a period's open movements, confirm or skip.
 *  - MatchRulesPanel: learned/manual description rules, visible and editable.
 * Nothing is ever matched automatically.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from '@/lib/toast';
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QueueItemCard, type QueueRow } from "@/components/finance/review-queue";
import { useAddFinDocPayment } from "@/lib/finance/use-documents";
import {
  confidenceTone, fetchSuggestions, fetchTxOpenBalance, learnFromMatch, reasonLine, suggestionsKey, type Suggestion,
} from "@/lib/finance/reconcile-suggestions";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat(uiI18n.language, { style: "currency", currency: "EUR" }).format(Number(n));

export type SuggestTx = { id: string; transaction_date: string; description: string; amount: number };

function invalidateRecon(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["bank-tx", "bank-tx-links", "bank-tx-counts", "period-window", "reconcile-candidates", "reconcile-suggestions", "review-queue"]) {
    qc.invalidateQueries({ queryKey: ["finance", k] });
  }
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone = confidenceTone(value);
  const cls = tone === "high" ? "border-emerald-600 text-emerald-700" : tone === "medium" ? "border-amber-500 text-amber-700" : "text-muted-foreground";
  return <Badge variant="outline" className={`text-[10px] tabular-nums shrink-0 ${cls}`}>{value}%</Badge>;
}

function SuggestionText({ s }: { s: Suggestion }) {
  const { t } = useTranslation(["finance", "common"]);
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate">
        <Badge variant="secondary" className="text-[10px] mr-1">{t(`finance:candidatePool.kind.${s.kind}`)}</Badge>
        {s.label}{s.counterparty ? ` · ${s.counterparty}` : ""}
      </div>
      <div className="text-[10px] text-muted-foreground truncate">
        {s.doc_date ?? "—"} · {t("finance:reconSuggest.open")} {fmt(s.outstanding)} — {reasonLine(s.reasons, t as never, fmt)}
      </div>
    </div>
  );
}

export function TxSuggestions({
  tx, onMatchDoc, onConfirmEntrada,
}: {
  tx: SuggestTx;
  onMatchDoc: (docId: string) => void;
  onConfirmEntrada: (queueId: string) => void;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const q = useQuery({ queryKey: suggestionsKey(tx.id), queryFn: () => fetchSuggestions(tx.id) });
  const openQ = useQuery({ queryKey: ["finance", "reconcile-suggestions", "open", tx.id], queryFn: () => fetchTxOpenBalance(tx.id) });
  const rows = q.data ?? [];
  const open = openQ.data;
  const partial = open != null && open > 0.005 && open < Math.abs(tx.amount) - 0.005;
  return (
    <div className="border rounded-md">
      <div className="p-2 border-b flex items-center gap-2">
        <Sparkles className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{t("finance:reconSuggest.title")}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{t("finance:reconSuggest.neverAuto")}</span>
      </div>
      {partial && (
        <p className="px-2 py-1 text-[11px] bg-muted/50">{t("finance:reconSuggest.txOpen", { open: fmt(open), total: fmt(Math.abs(tx.amount)) })}</p>
      )}
      <div className="divide-y">
        {q.isLoading ? (
          <p className="p-3 text-xs text-muted-foreground">{t("common:loading")}</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">{t("finance:reconSuggest.none")}</p>
        ) : rows.map((s) => (
          <div key={`${s.kind}-${s.ref_id}`} className="px-2 py-1.5 flex items-center gap-2 text-xs">
            <ConfidenceBadge value={s.confidence} />
            <SuggestionText s={s} />
            {s.kind === "entrada" ? (
              <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onConfirmEntrada(s.ref_id)}>{t("finance:reconSuggest.confirmAndMatch")}</Button>
            ) : (
              <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onMatchDoc(s.ref_id)}>{t("finance:candidatePool.match")}</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Confirm a pending Entrada document (same card and validation as Entrada) and match it to the movement. */
export function EntradaConfirmMatchSheet({
  queueId, tx, onClose, onDone,
}: {
  queueId: string;
  tx: SuggestTx;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const isPt = i18n.language?.startsWith("pt") ?? true;
  const qc = useQueryClient();
  const { user } = useAuth();
  const addPayment = useAddFinDocPayment();

  const rowQ = useQuery({
    queryKey: ["finance", "review-queue", "single", queueId],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_document_review_queue").select("*").eq("id", queueId).single();
      if (error) throw error;
      return data as unknown as QueueRow & { entity_id: string };
    },
  });
  const entitiesQ = useQuery({
    queryKey: ["finance", "entities", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_entities").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const classificationsQ = useQuery({
    queryKey: ["finance", "classifications", "options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_classifications").select("id, code, name_pt, name_en, level").eq("active", true).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const suppliersQ = useQuery({
    queryKey: ["finance", "suppliers", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, nome, nif, is_supplier").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const projectsQ = useQuery({
    queryKey: ["finance", "projects", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pm_projects").select("id, name").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const row = rowQ.data;
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => { if (row && entityId == null) setEntityId(row.entity_id); }, [row, entityId]);

  async function beforeConfirm() {
    if (!row || !entityId || entityId === row.entity_id) return;
    const { error } = await supabase.from("financial_document_review_queue").update({ entity_id: entityId }).eq("id", row.id);
    if (error) throw new Error(error.message);
  }
  async function onConfirmFailed() {
    if (!row || !entityId || entityId === row.entity_id) return;
    await supabase.from("financial_document_review_queue").update({ entity_id: row.entity_id }).eq("id", row.id);
  }
  async function onConfirmed(documentId?: string) {
    if (!documentId) { toast.error(t("finance:reconSuggest.matchFailed")); return; }
    try {
      const [{ data: doc, error }, open] = await Promise.all([
        supabase.from("financial_documents").select("id, outstanding_amount").eq("id", documentId).single(),
        fetchTxOpenBalance(tx.id),
      ]);
      if (error) throw error;
      const amount = Math.round(Math.min(Number(doc.outstanding_amount ?? 0), open) * 100) / 100;
      if (amount <= 0) throw new Error(t("finance:reconSuggest.nothingOpen"));
      await addPayment.mutateAsync({
        document_id: documentId, bank_transaction_id: tx.id, amount, payment_date: tx.transaction_date,
        method: "bank_transfer", created_by: user?.id ?? null,
      });
      await learnFromMatch(tx.id, documentId);
      toast.success(t("finance:reconSuggest.confirmedMatched", { amount: fmt(amount) }));
      invalidateRecon(qc);
      onDone?.();
      onClose();
    } catch (e) {
      // The document stays confirmed; the movement is simply not matched yet.
      toast.error(`${t("finance:reconSuggest.matchFailed")} ${translateError((e as Error).message)}`);
      invalidateRecon(qc);
      onClose();
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto space-y-3">
        <SheetHeader>
          <SheetTitle>{t("finance:reconSuggest.sheetTitle")}</SheetTitle>
        </SheetHeader>
        <div className="rounded-md border p-2 text-xs flex justify-between gap-2">
          <span>{tx.transaction_date}</span>
          <span className="truncate">{tx.description}</span>
          <span className="tabular-nums font-medium">{fmt(tx.amount)}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t("finance:reconSuggest.sheetHint")}</p>
        {row && (
          <div className="flex items-center gap-2">
            <Label className="text-xs">{t("finance:reconSuggest.company")}</Label>
            <Select value={entityId ?? ""} onValueChange={setEntityId}>
              <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(entitiesQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {!row ? (
          <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
        ) : row.status !== "pending_review" ? (
          <p className="text-sm text-muted-foreground">{t("finance:reconSuggest.notPending")}</p>
        ) : (
          <QueueItemCard
            row={row}
            isPt={isPt}
            classifications={(classificationsQ.data ?? []) as never}
            suppliers={(suppliersQ.data ?? []) as never}
            projects={(projectsQ.data ?? []) as never}
            beforeConfirm={beforeConfirm}
            onConfirmFailed={() => void onConfirmFailed()}
            onConfirmed={(id) => void onConfirmed(id)}
          />
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>{t("common:cancel")}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Per-period "review suggestions": one open movement at a time, confirm or skip. */
export function ReviewSuggestionsDialog({ periodId, onClose }: { periodId: string; onClose: () => void }) {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const { user } = useAuth();
  const addPayment = useAddFinDocPayment();
  const listQ = useQuery({
    queryKey: ["finance", "review-suggestions-list", periodId],
    staleTime: Infinity,
    queryFn: async (): Promise<SuggestTx[]> => {
      const { data: p, error } = await supabase.from("bank_statement_periods")
        .select("bank_account_id, period_start_date, period_end_date").eq("id", periodId).single();
      if (error) throw error;
      const { data, error: e2 } = await supabase.from("bank_transactions")
        .select("id, transaction_date, description, amount")
        .eq("bank_account_id", p.bank_account_id).eq("status", "unclassified")
        .gte("transaction_date", p.period_start_date).lte("transaction_date", p.period_end_date)
        .order("transaction_date");
      if (e2) throw e2;
      return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
    },
  });
  const list = listQ.data ?? [];
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState({ confirmed: 0, skipped: 0 });
  const tx = list[idx] ?? null;
  const sQ = useQuery({ queryKey: suggestionsKey(tx?.id ?? "none"), enabled: !!tx, queryFn: () => fetchSuggestions(tx!.id) });
  const sugg = sQ.data ?? [];
  const [pick, setPick] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [entradaFor, setEntradaFor] = useState<string | null>(null);
  const picked = useMemo(() => sugg.find((s) => `${s.kind}:${s.ref_id}` === pick) ?? null, [sugg, pick]);
  useEffect(() => {
    const first = sugg[0];
    setPick(first ? `${first.kind}:${first.ref_id}` : "");
  }, [sQ.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (picked) setAmount(picked.suggested_amount.toFixed(2)); }, [picked]);

  const next = (kind: "confirmed" | "skipped") => { setDone((d) => ({ ...d, [kind]: d[kind] + 1 })); setIdx((i) => i + 1); };

  async function confirm() {
    if (!tx || !picked) return;
    if (picked.kind === "entrada") { setEntradaFor(picked.ref_id); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > Number(picked.outstanding ?? 0) + 0.005 || amt > picked.tx_open + 0.005) {
      toast.error(t("finance:reconSuggest.amountInvalid"));
      return;
    }
    try {
      await addPayment.mutateAsync({
        document_id: picked.ref_id, bank_transaction_id: tx.id, amount: amt, payment_date: tx.transaction_date,
        method: "bank_transfer", created_by: user?.id ?? null,
      });
      await learnFromMatch(tx.id, picked.ref_id);
      invalidateRecon(qc);
      next("confirmed");
    } catch (e) {
      toast.error(translateError((e as Error).message));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t("finance:reconSuggest.reviewTitle")}</DialogTitle></DialogHeader>
        {listQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
        ) : !tx ? (
          <p className="text-sm">{t("finance:reconSuggest.reviewDone", { confirmed: done.confirmed, skipped: done.skipped })}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("finance:reconSuggest.progress", { n: idx + 1, total: list.length })} · {t("finance:reconSuggest.neverAuto")}</p>
            <div className="rounded-md border p-2 text-xs flex justify-between gap-2">
              <span>{tx.transaction_date}</span>
              <span className="truncate">{tx.description}</span>
              <span className="tabular-nums font-medium">{fmt(tx.amount)}</span>
            </div>
            {sQ.isLoading ? (
              <p className="text-xs text-muted-foreground">{t("common:loading")}</p>
            ) : sugg.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("finance:reconSuggest.none")}</p>
            ) : (
              <RadioGroup value={pick} onValueChange={setPick} className="border rounded-md divide-y gap-0">
                {sugg.map((s) => (
                  <label key={`${s.kind}:${s.ref_id}`} className="px-2 py-1.5 flex items-center gap-2 text-xs cursor-pointer">
                    <RadioGroupItem value={`${s.kind}:${s.ref_id}`} />
                    <ConfidenceBadge value={s.confidence} />
                    <SuggestionText s={s} />
                  </label>
                ))}
              </RadioGroup>
            )}
            {picked && picked.kind !== "entrada" && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">{t("finance:documents.payments.amount")}</Label>
                <Input type="number" step="0.01" className="h-8 w-[140px]" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span className="text-[11px] text-muted-foreground">{t("finance:reconSuggest.partialHint")}</span>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {tx ? (
            <>
              <Button variant="outline" onClick={() => next("skipped")}>{t("finance:reconSuggest.skip")}</Button>
              <Button onClick={confirm} disabled={!picked || addPayment.isPending}>
                {picked?.kind === "entrada" ? t("finance:reconSuggest.confirmAndMatch") : t("finance:reconSuggest.confirm")}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>{t("common:close", { defaultValue: "OK" })}</Button>
          )}
        </DialogFooter>
        {entradaFor && tx && (
          <EntradaConfirmMatchSheet queueId={entradaFor} tx={tx} onClose={() => setEntradaFor(null)} onDone={() => next("confirmed")} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type RuleRow = {
  id: string; name: string; match_type: string; pattern: string; classification_id: string | null; supplier_id: string | null;
  source: string; learned_count: number; last_learned_at: string | null; active: boolean; needs_review: boolean;
};

/** Description rules (manual and learned from confirmed matches), visible to finance and editable by admins. */
export function MatchRulesPanel({ classifications, isPt }: { classifications: Array<{ id: string; code: string; name_pt: string; name_en: string }>; isPt: boolean }) {
  const { t } = useTranslation(["finance", "common"]);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const rulesQ = useQuery({
    queryKey: ["finance", "bank-rules", "all"],
    enabled: open,
    queryFn: async (): Promise<RuleRow[]> => {
      const { data, error } = await supabase.from("bank_classification_rules")
        .select("id, name, match_type, pattern, classification_id, supplier_id, source, learned_count, last_learned_at, active, needs_review")
        .order("source").order("priority");
      if (error) throw error;
      return (data ?? []) as RuleRow[];
    },
  });
  const suppliersQ = useQuery({
    queryKey: ["finance", "suppliers", "picker"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, nome, nif, is_supplier").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  async function update(id: string, patch: Partial<RuleRow>) {
    const { error } = await supabase.from("bank_classification_rules").update(patch as never).eq("id", id);
    if (error) { toast.error(translateError(error.message)); return; }
    toast.success(t("finance:reconSuggest.rules.saved"));
    qc.invalidateQueries({ queryKey: ["finance", "bank-rules"] });
    qc.invalidateQueries({ queryKey: ["finance", "reconcile-suggestions"] });
  }
  const NONE = "__none__";
  return (
    <Card>
      <CardHeader className="py-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{t("finance:reconSuggest.rules.title")}</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? t("finance:reconSuggest.rules.hide") : t("finance:reconSuggest.rules.show")}</Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("finance:reconSuggest.rules.hint")}</p>
          {(rulesQ.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("finance:reconSuggest.rules.empty")}</p>
          ) : (
            <div className="divide-y border rounded-md">
              {(rulesQ.data ?? []).map((r) => (
                <div key={r.id} className="p-2 grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 items-center text-xs">
                  <Input className="h-7 text-xs" defaultValue={r.pattern} disabled={!isAdmin}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.pattern) void update(r.id, { pattern: v }); }} />
                  <Select value={r.supplier_id ?? NONE} disabled={!isAdmin} onValueChange={(v) => void update(r.id, { supplier_id: v === NONE ? null : v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t("finance:reconSuggest.rules.supplier")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("finance:reconSuggest.rules.noSupplier")}</SelectItem>
                      {(suppliersQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={r.classification_id ?? NONE} disabled={!isAdmin} onValueChange={(v) => void update(r.id, { classification_id: v === NONE ? null : v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t("finance:reconSuggest.rules.category")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("finance:reconSuggest.rules.noCategory")}</SelectItem>
                      {classifications.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {isPt ? c.name_pt : c.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Badge variant={r.source === "learned" ? "secondary" : "outline"} className="text-[10px]">
                    {r.source === "learned" ? t("finance:reconSuggest.rules.learned", { count: r.learned_count }) : t("finance:reconSuggest.rules.manual")}
                  </Badge>
                  <Switch checked={r.active} disabled={!isAdmin} onCheckedChange={(v) => void update(r.id, { active: v })} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
