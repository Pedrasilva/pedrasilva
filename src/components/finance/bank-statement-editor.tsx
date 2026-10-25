/**
 * Bank statement fields: every AI-read value is editable. The AI value stays on the
 * row (bank_ai_values); corrected fields are marked with who/when. Saving goes through
 * fin_bank_statement_save, which refuses edits when the statement's period is locked.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from '@/lib/toast';
import { Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccountsLite, usePaymentCards } from "@/lib/finance/use-payment-cards";
import {
  BANK_DOC_KINDS,
  changedFields,
  hubComparison,
  isStatementKind,
  type BankDocRow,
  type StatementField,
} from "@/lib/finance/bank-statements";

export const BANK_DOC_SELECT =
  "id, status, bank_doc_kind, extracted_bank_name, matched_bank_account_id, matched_payment_card_id, extracted_statement_number, extracted_period_start, extracted_period_end, extracted_opening_balance, extracted_closing_balance, extracted_total_debits, extracted_total_credits, extracted_card_due_date, extracted_card_amount_to_debit, extracted_statement_card_last4, bank_identity_flag, bank_ai_values, bank_field_overrides, statement_period_id, source_file_url, source_bucket, original_filename, bank_period, created_at";

export type RegistryFigures = {
  queue_item_id: string;
  hub_total: number | null;
  hub_count: number;
  hub_reconciled_count: number;
  first_tx: string | null;
  last_tx: string | null;
  period_locked_at: string | null;
};

export const REGISTRY_KEY = ["finance", "bank-document-registry"] as const;

export function useBankDocRow(id: string) {
  return useQuery({
    queryKey: [...REGISTRY_KEY, "row", id],
    queryFn: async (): Promise<BankDocRow> => {
      const { data, error } = await supabase
        .from("financial_document_review_queue")
        .select(BANK_DOC_SELECT)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as BankDocRow;
    },
  });
}

export function useRegistryFigures(id?: string) {
  return useQuery({
    queryKey: [...REGISTRY_KEY, "figures", id ?? "all"],
    queryFn: async (): Promise<Map<string, RegistryFigures>> => {
      const { data, error } = await supabase.rpc("fin_bank_document_registry", id ? { _queue_item_id: id } : {});
      if (error) throw error;
      const m = new Map<string, RegistryFigures>();
      for (const r of (data ?? []) as RegistryFigures[]) m.set(r.queue_item_id, r);
      return m;
    },
  });
}

export const money = (n: number | null | undefined, lang = "pt-PT") =>
  n == null ? "—" : new Intl.NumberFormat(lang, { style: "currency", currency: "EUR" }).format(Number(n));

/** Printed balances next to the Hub's figures, difference green/red. */
export function BalanceComparison({ row, figures }: { row: BankDocRow; figures?: RegistryFigures | null }) {
  const { t } = useTranslation(["finance"]);
  const c = hubComparison(row.extracted_opening_balance, row.extracted_closing_balance, figures?.hub_total);
  const ready = c.printedOpening != null && c.printedClosing != null && row.matched_bank_account_id && row.extracted_period_start && row.extracted_period_end;
  if (!ready) return <p className="text-xs text-muted-foreground">{t("finance:bankDocs.compare.incomplete")}</p>;
  return (
    <div className="rounded-md border p-3 text-sm space-y-2">
      <div className="font-medium">{t("finance:bankDocs.compare.title")}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <div className="text-xs uppercase text-muted-foreground">{t("finance:bankDocs.compare.printed")}</div>
        <div className="text-xs uppercase text-muted-foreground">{t("finance:bankDocs.compare.hub")}</div>
        <div>{t("finance:bankDocs.compare.opening")}: <span className="tabular-nums font-medium">{money(c.printedOpening)}</span></div>
        <div>{t("finance:bankDocs.compare.opening")}: <span className="tabular-nums">{money(c.printedOpening)}</span> + {t("finance:bankDocs.compare.movements")}: <span className="tabular-nums">{money(c.movements)}</span> ({figures?.hub_count ?? 0})</div>
        <div>{t("finance:bankDocs.compare.closing")}: <span className="tabular-nums font-medium">{money(c.printedClosing)}</span></div>
        <div>{t("finance:bankDocs.compare.computed")}: <span className="tabular-nums font-medium">{money(c.computedClosing)}</span></div>
      </div>
      <div className={"font-semibold tabular-nums " + (c.matches ? "text-success" : "text-destructive")}>
        {t("finance:bankDocs.compare.difference")}: {money(c.difference)} · {c.matches ? t("finance:bankDocs.compare.matches") : t("finance:bankDocs.compare.differs")}
      </div>
    </div>
  );
}

type Draft = Partial<Record<StatementField, string>>;
const toDraft = (r: BankDocRow): Draft => ({
  bank_doc_kind: r.bank_doc_kind ?? "",
  matched_bank_account_id: r.matched_bank_account_id ?? "",
  matched_payment_card_id: r.matched_payment_card_id ?? "",
  extracted_statement_number: r.extracted_statement_number ?? "",
  extracted_period_start: r.extracted_period_start ?? "",
  extracted_period_end: r.extracted_period_end ?? "",
  extracted_opening_balance: r.extracted_opening_balance == null ? "" : String(r.extracted_opening_balance),
  extracted_closing_balance: r.extracted_closing_balance == null ? "" : String(r.extracted_closing_balance),
  extracted_total_debits: r.extracted_total_debits == null ? "" : String(r.extracted_total_debits),
  extracted_total_credits: r.extracted_total_credits == null ? "" : String(r.extracted_total_credits),
  extracted_card_due_date: r.extracted_card_due_date ?? "",
  extracted_card_amount_to_debit: r.extracted_card_amount_to_debit == null ? "" : String(r.extracted_card_amount_to_debit),
});
const NUMERIC: StatementField[] = ["extracted_opening_balance", "extracted_closing_balance", "extracted_total_debits", "extracted_total_credits", "extracted_card_amount_to_debit"];

export function StatementFieldsEditor({
  row,
  figures,
  onDirtyChange,
}: {
  row: BankDocRow;
  figures?: RegistryFigures | null;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const accountsQ = useAccountsLite();
  const cardsQ = usePaymentCards();
  const meQ = useQuery({ queryKey: ["auth", "me-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const [draft, setDraft] = useState<Draft>(() => toDraft(row));
  useEffect(() => setDraft(toDraft(row)), [row]);
  const locked = !!figures?.period_locked_at;

  const asRow = useMemo(() => {
    const o: Partial<Record<StatementField, unknown>> = {};
    for (const [k, v] of Object.entries(draft)) {
      o[k as StatementField] = v === "" ? null : NUMERIC.includes(k as StatementField) ? Number(String(v).replace(",", ".")) : v;
    }
    return o;
  }, [draft]);
  const diff = useMemo(() => changedFields(row as unknown as Record<StatementField, unknown>, asRow), [row, asRow]);
  const dirty = Object.keys(diff).length > 0;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("fin_bank_statement_save", { _id: row.id, _fields: diff as never });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("finance:bankDocs.saved"));
      qc.invalidateQueries({ queryKey: REGISTRY_KEY });
      qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const lang = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";
  const overrides = row.bank_field_overrides ?? {};
  const mark = (f: StatementField) => {
    const o = overrides[f];
    if (!o) return null;
    const date = new Date(o.at).toLocaleString(lang);
    const ai = o.ai == null ? "—" : String(o.ai);
    return (
      <div className="text-[11px] text-warning flex items-center gap-1">
        <Pencil className="h-3 w-3" />
        {o.by && o.by === meQ.data ? t("finance:bankDocs.correctedByYou", { date }) : t("finance:bankDocs.correctedByOther", { date })}
        {" · "}{t("finance:bankDocs.aiValue", { value: ai })}
      </div>
    );
  };
  const set = (f: StatementField) => (v: string) => setDraft((d) => ({ ...d, [f]: v }));
  const kind = draft.bank_doc_kind || null;
  const isCard = kind === "card_statement";

  const text = (f: StatementField, label: string, type: "text" | "date" | "number" = "text") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} step={type === "number" ? "0.01" : undefined} value={draft[f] ?? ""} disabled={locked} onChange={(e) => set(f)(e.target.value)} />
      {mark(f)}
    </div>
  );

  return (
    <div className="space-y-3">
      {locked && <p className="text-xs text-destructive">{t("finance:bankDocs.locked")}</p>}
      {row.bank_identity_flag && (
        <p className="text-xs text-warning">
          {t(row.bank_identity_flag === "unknown_card" ? "finance:bankDocs.unknownCard" : row.bank_identity_flag === "card_without_card_account" ? "finance:bankDocs.cardWithoutAccount" : "finance:bankDocs.unknownAccount")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("finance:bankDocs.fields.kind")}</Label>
          <Select value={draft.bank_doc_kind || "__none"} disabled={locked} onValueChange={(v) => set("bank_doc_kind")(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BANK_DOC_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`finance:bankDocs.kind.${k}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          {mark("bank_doc_kind")}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("finance:bankDocs.fields.account")}</Label>
          <Select value={draft.matched_bank_account_id || "__none"} disabled={locked} onValueChange={(v) => set("matched_bank_account_id")(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder={t("finance:bankDocs.fields.pick")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">{t("finance:bankDocs.fields.none")}</SelectItem>
              {(accountsQ.data ?? []).filter((a) => !a.archived_at).map((a) => (
                <SelectItem key={a.id} value={a.id}>{[a.bank_name, a.account_name].filter(Boolean).join(" · ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mark("matched_bank_account_id")}
        </div>
        {isCard && (
          <div className="space-y-1">
            <Label className="text-xs">{t("finance:bankDocs.fields.card")}</Label>
            <Select value={draft.matched_payment_card_id || "__none"} disabled={locked} onValueChange={(v) => set("matched_payment_card_id")(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("finance:bankDocs.fields.pick")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("finance:bankDocs.fields.none")}</SelectItem>
                {(cardsQ.data ?? []).filter((c) => c.active).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.holder_name ?? "?"} · …{c.last4 ?? "????"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mark("matched_payment_card_id")}
            {row.extracted_statement_card_last4 && <div className="text-[11px] text-muted-foreground">…{row.extracted_statement_card_last4}</div>}
          </div>
        )}
        {isStatementKind(kind) && (
          <>
            {text("extracted_statement_number", t("finance:bankDocs.fields.number"))}
            {text("extracted_period_start", t("finance:bankDocs.fields.start"), "date")}
            {text("extracted_period_end", t("finance:bankDocs.fields.end"), "date")}
            {text("extracted_opening_balance", t("finance:bankDocs.fields.opening"), "number")}
            {text("extracted_closing_balance", t("finance:bankDocs.fields.closing"), "number")}
            {text("extracted_total_debits", t("finance:bankDocs.fields.debits"), "number")}
            {text("extracted_total_credits", t("finance:bankDocs.fields.credits"), "number")}
            {isCard && text("extracted_card_due_date", t("finance:bankDocs.fields.dueDate"), "date")}
            {isCard && text("extracted_card_amount_to_debit", t("finance:bankDocs.fields.toDebit"), "number")}
          </>
        )}
      </div>
      {isStatementKind(kind) && <BalanceComparison row={row} figures={figures} />}
      <Button size="sm" variant="outline" disabled={!dirty || locked || save.isPending} onClick={() => save.mutate()}>
        {save.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        {t("finance:bankDocs.save")}
      </Button>
    </div>
  );
}
