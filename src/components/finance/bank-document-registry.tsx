/**
 * Bancos > Extratos > Documentos bancários: one row per statement/document from the
 * Entrada bank queue, grouped by account (or card) then month. Shows printed balances
 * next to the Hub's figures, duplicates (same account + period), gaps and continuity.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAccountsLite, usePaymentCards } from "@/lib/finance/use-payment-cards";
import {
  BANK_DOC_KINDS,
  continuityBreaks,
  findDuplicates,
  findGaps,
  hubComparison,
  type BankDocRow,
} from "@/lib/finance/bank-statements";
import {
  BANK_DOC_SELECT,
  REGISTRY_KEY,
  StatementFieldsEditor,
  money,
  useRegistryFigures,
} from "@/components/finance/bank-statement-editor";

const ALL = "__all";

export function BankDocumentRegistry() {
  const { t, i18n } = useTranslation(["finance"]);
  const lang = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";
  const rowsQ = useQuery({
    queryKey: [...REGISTRY_KEY, "rows"],
    queryFn: async (): Promise<BankDocRow[]> => {
      const { data, error } = await supabase
        .from("financial_document_review_queue")
        .select(BANK_DOC_SELECT)
        .eq("intake_route", "bank")
        .in("status", ["pending_review", "filed", "duplicate"])
        .order("extracted_period_start", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as BankDocRow[];
    },
  });
  const figuresQ = useRegistryFigures();
  const accountsQ = useAccountsLite();
  const cardsQ = usePaymentCards();
  const entityQ = useQuery({
    queryKey: ["finance", "current-entity-name"],
    queryFn: async () => {
      const { data: id } = await supabase.rpc("current_finance_entity");
      if (!id) return null;
      const { data } = await supabase.from("finance_entities").select("name").eq("id", id as string).maybeSingle();
      return (data as { name?: string } | null)?.name ?? null;
    },
  });

  const [bank, setBank] = useState(ALL);
  const [holder, setHolder] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [month, setMonth] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = rowsQ.data ?? [];
  const accounts = new Map((accountsQ.data ?? []).map((a) => [a.id, a]));
  const cards = new Map((cardsQ.data ?? []).map((c) => [c.id, c]));
  const figures = figuresQ.data ?? new Map();

  const holderKey = (r: BankDocRow) =>
    r.bank_doc_kind === "card_statement" && r.matched_payment_card_id
      ? `card:${r.matched_payment_card_id}`
      : r.matched_bank_account_id ? `acc:${r.matched_bank_account_id}` : "unknown";
  const holderLabel = (k: string) => {
    if (k.startsWith("card:")) {
      const c = cards.get(k.slice(5));
      return c ? `${c.bank ?? ""} · ${c.holder_name ?? ""} …${c.last4 ?? "????"}` : k;
    }
    if (k.startsWith("acc:")) {
      const a = accounts.get(k.slice(4));
      return a ? [a.bank_name, a.account_name].filter(Boolean).join(" · ") : k;
    }
    return t("finance:bankDocs.unknownAccount");
  };
  const bankOf = (r: BankDocRow) => {
    const a = r.matched_bank_account_id ? accounts.get(r.matched_bank_account_id) : null;
    return a?.bank_name ?? r.extracted_bank_name ?? "—";
  };
  const monthKey = (r: BankDocRow) => (r.extracted_period_end ?? r.bank_period ?? r.created_at).slice(0, 7);

  const dups = useMemo(() => findDuplicates(rows), [rows]);
  const gaps = useMemo(() => new Map(findGaps(rows).map((g) => [g.key, g.months])), [rows]);
  const breaks = useMemo(() => continuityBreaks(rows), [rows]);

  const filtered = rows.filter((r) =>
    (bank === ALL || bankOf(r) === bank) &&
    (holder === ALL || holderKey(r) === holder) &&
    (kind === ALL || (r.bank_doc_kind ?? "none") === kind) &&
    (year === ALL || monthKey(r).slice(0, 4) === year) &&
    (month === ALL || monthKey(r).slice(5, 7) === month) &&
    (status === ALL || r.status === status),
  );

  const grouped = useMemo(() => {
    const g = new Map<string, Map<string, BankDocRow[]>>();
    for (const r of filtered) {
      const h = holderKey(r);
      const m = monthKey(r);
      if (!g.has(h)) g.set(h, new Map());
      const mm = g.get(h)!;
      mm.set(m, [...(mm.get(m) ?? []), r]);
    }
    return [...g.entries()].sort((a, b) => holderLabel(a[0]).localeCompare(holderLabel(b[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, accountsQ.data, cardsQ.data]);

  const banks = [...new Set(rows.map(bankOf))].sort();
  const holders = [...new Set(rows.map(holderKey))];
  const years = [...new Set(rows.map((r) => monthKey(r).slice(0, 4)))].sort().reverse();
  const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString(lang) : "—");
  const monthLabel = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString(lang, { month: "long", year: "numeric" });

  const openPdf = async (r: BankDocRow) => {
    if (!r.source_file_url) return;
    const { data, error } = await supabase.storage.from(r.source_bucket || "financial-documents").createSignedUrl(r.source_file_url, 3600);
    if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  const filter = (label: string, value: string, onChange: (v: string) => void, opts: Array<[string, string]>) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("finance:bankDocs.filters.all")}</SelectItem>
          {opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const openRow = rows.find((r) => r.id === openId) ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("finance:bankDocs.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("finance:bankDocs.subtitle")}</p>
        {entityQ.data && <p className="text-xs text-muted-foreground">{t("finance:bankDocs.filters.companyHint", { name: entityQ.data })}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-6">
          {filter(t("finance:bankDocs.filters.bank"), bank, setBank, banks.map((b) => [b, b]))}
          {filter(t("finance:bankDocs.filters.account"), holder, setHolder, holders.map((h) => [h, holderLabel(h)]))}
          {filter(t("finance:bankDocs.filters.kind"), kind, setKind, [...BANK_DOC_KINDS, "none"].map((k) => [k, t(`finance:bankDocs.kind.${k}`)]))}
          {filter(t("finance:bankDocs.filters.year"), year, setYear, years.map((y) => [y, y]))}
          {filter(t("finance:bankDocs.filters.month"), month, setMonth, Array.from({ length: 12 }, (_, i) => {
            const m = String(i + 1).padStart(2, "0");
            return [m, new Date(`2026-${m}-01T00:00:00`).toLocaleDateString(lang, { month: "long" })] as [string, string];
          }))}
          {filter(t("finance:bankDocs.filters.status"), status, setStatus, ["pending_review", "filed", "duplicate"].map((s) => [s, t(`finance:bankDocs.status.${s}`)]))}
        </div>

        {grouped.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">{t("finance:bankDocs.empty")}</p>}

        <Accordion type="multiple" className="space-y-2">
          {grouped.map(([h, months]) => {
            const count = [...months.values()].reduce((s, l) => s + l.length, 0);
            const gapMonths = gaps.get(h);
            return (
              <AccordionItem key={h} value={h} className="border rounded-md px-3">
                <AccordionTrigger className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-left">
                    <span className="font-medium">{holderLabel(h)}</span>
                    <Badge variant="outline">{t("finance:bankDocs.docs", { count })}</Badge>
                    {gapMonths && <Badge variant="destructive">{t("finance:bankDocs.gap", { months: gapMonths.map(monthLabel).join(", ") })}</Badge>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pb-3">
                  {[...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([m, list]) => (
                    <div key={m} className="space-y-1">
                      <div className="text-xs font-medium uppercase text-muted-foreground pt-2">{monthLabel(m)}</div>
                      {list.map((r) => {
                        const f = figures.get(r.id);
                        const c = hubComparison(r.extracted_opening_balance, r.extracted_closing_balance, f?.hub_total);
                        const brk = breaks.get(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setOpenId(r.id)}
                            className="w-full rounded-md border p-2 text-left text-sm hover:bg-muted/50 grid gap-1 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] items-center"
                          >
                            <div className="space-y-0.5">
                              <div className="font-medium">
                                {t(`finance:bankDocs.kind.${r.bank_doc_kind ?? "none"}`)}
                                {r.extracted_statement_number && <span className="text-muted-foreground"> · {t("finance:bankDocs.cols.number")} {r.extracted_statement_number}</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">{fmtDate(r.extracted_period_start)} – {fmtDate(r.extracted_period_end)} · {t(`finance:bankDocs.status.${r.status}`)}</div>
                              <div className="flex flex-wrap gap-1">
                                {dups.has(r.id) && <Badge variant="destructive" className="text-[10px]">{t("finance:bankDocs.duplicateBadge")}</Badge>}
                                {r.bank_identity_flag && <Badge variant="outline" className="text-[10px] text-warning">{t(r.bank_identity_flag === "unknown_card" ? "finance:bankDocs.unknownCard" : r.bank_identity_flag === "card_without_card_account" ? "finance:bankDocs.cardWithoutAccount" : "finance:bankDocs.unknownAccount")}</Badge>}
                                {brk && <Badge variant="outline" className="text-[10px] text-destructive">{t("finance:bankDocs.continuity", { opening: money(brk.opening), previous: money(brk.previousClosing), diff: money(brk.difference) })}</Badge>}
                              </div>
                            </div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">{t("finance:bankDocs.cols.printedOpening")}</div><div className="tabular-nums">{money(c.printedOpening)}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">{t("finance:bankDocs.cols.printedClosing")}</div><div className="tabular-nums">{money(c.printedClosing)}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">{t("finance:bankDocs.cols.computedClosing")}</div><div className="tabular-nums">{c.printedOpening == null ? "—" : money(c.computedClosing)}</div></div>
                            <div>
                              <div className="text-[10px] uppercase text-muted-foreground">{t("finance:bankDocs.cols.difference")}</div>
                              <div className={"tabular-nums font-medium " + (c.matches == null ? "" : c.matches ? "text-success" : "text-destructive")}>{money(c.difference)}</div>
                            </div>
                            <div className="text-xs">
                              {!r.statement_period_id ? (
                                <span className="text-muted-foreground">{t("finance:bankDocs.noPeriod")}</span>
                              ) : f?.period_locked_at ? (
                                <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" />{t("finance:bankDocs.reconciled")}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-muted-foreground"><AlertTriangle className="h-3 w-3" />{t("finance:bankDocs.notReconciled")}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>

      <Dialog open={!!openRow} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {openRow && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {holderLabel(holderKey(openRow))} · {fmtDate(openRow.extracted_period_start)} – {fmtDate(openRow.extracted_period_end)}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {openRow.source_file_url ? (
                  <Button size="sm" variant="outline" onClick={() => openPdf(openRow)}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />{t("finance:bankDocs.openPdf")}
                  </Button>
                ) : <span className="text-muted-foreground">{t("finance:bankDocs.noPdf")}</span>}
                {figures.get(openRow.id) && (
                  <span className="text-xs text-muted-foreground">
                    {t("finance:bankDocs.reconciledCount", { done: figures.get(openRow.id)!.hub_reconciled_count, total: figures.get(openRow.id)!.hub_count })}
                  </span>
                )}
              </div>
              <StatementFieldsEditor row={openRow} figures={figures.get(openRow.id)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
