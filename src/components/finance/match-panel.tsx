import uiI18n from "@/i18n/index";
/**
 * Reconciliation match panel — the single place to match a bank movement.
 *  1. Suggestions (top 5, ranked in the database) with confidence + reason.
 *  2. The whole candidate pool, same direction and company, sorted by amount closeness, searchable.
 *  3. Click/hover a row to preview the document file without leaving the screen.
 *  4. Checkboxes for split payments with running total vs the movement and remainder.
 *  5. After a match the parent moves to the next unmatched movement.
 *  6. Keyboard: ↑/↓ choose, Enter match, N next.
 * Nothing is ever matched automatically, and saved matches are never changed here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from '@/lib/toast';
import { Search, Sparkles, FileText, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PdfCanvasPreview } from "@/components/finance/pdf-preview";
import { useAddFinDocPayment } from "@/lib/finance/use-documents";
import {
  confidenceTone, fetchSuggestions, fetchTxOpenBalance, learnFromMatch, reasonLine, refreshSuggestions, suggestionsKey, type Suggestion,
} from "@/lib/finance/reconcile-suggestions";
import { allocateSplit, dedupeSuggestions, type MatchOrigin } from "@/lib/finance/match-panel";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat(uiI18n.language, { style: "currency", currency: "EUR" }).format(Number(n));

export type MatchTx = { id: string; transaction_date: string; description: string; amount: number };

type Candidate = {
  kind: "purchase" | "sale" | "entrada" | "reimbursement" | "transfer";
  ref_id: string; label: string; counterparty: string | null; doc_date: string | null;
  amount: number | null; outstanding: number | null; detail: string | null; origin: MatchOrigin;
};

type Row = {
  key: string; section: "suggestion" | "pool";
  kind: Candidate["kind"]; ref_id: string; label: string; counterparty: string | null; doc_date: string | null;
  amount: number | null; outstanding: number | null; origin: MatchOrigin;
  confidence?: number; reasons?: Suggestion["reasons"];
};

const isDoc = (k: Row["kind"]) => k === "purchase" || k === "sale";

function useFilePreview(row: Row | null) {
  return useQuery({
    queryKey: ["finance", "match-preview", row?.kind, row?.ref_id],
    enabled: !!row && (isDoc(row.kind) || row.kind === "entrada"),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{ url: string; pdf: boolean } | null> => {
      if (!row) return null;
      let bucket = "financial-documents";
      let path: string | null = null;
      if (row.kind === "entrada") {
        const { data } = await supabase.from("financial_document_review_queue").select("source_file_url, source_bucket").eq("id", row.ref_id).maybeSingle();
        path = data?.source_file_url ?? null;
        bucket = data?.source_bucket || bucket;
      } else {
        const { data } = await supabase.from("financial_documents").select("file_path").eq("id", row.ref_id).maybeSingle();
        path = data?.file_path ?? null;
      }
      if (!path) return null;
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
      return data?.signedUrl ? { url: data.signedUrl, pdf: path.toLowerCase().endsWith(".pdf") } : null;
    },
  });
}

export function MatchPanel({
  tx, onConfirmEntrada, onMatchReimb, onMarkTransfer, onMatched, onNext,
}: {
  tx: MatchTx;
  onConfirmEntrada: (queueId: string) => void;
  onMatchReimb: () => void;
  onMarkTransfer: () => void;
  /** Called after a successful match; the parent moves to the next unmatched movement. */
  onMatched: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const { user } = useAuth();
  const addPayment = useAddFinDocPayment();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const h = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(h); }, [search]);
  useEffect(() => { setSearch(""); setDebounced(""); setChecked(new Set()); setFocus(0); setPreview(null); }, [tx.id]);

  const sQ = useQuery({ queryKey: suggestionsKey(tx.id), queryFn: () => fetchSuggestions(tx.id) });
  // Stale-while-revalidate: the cached list shows instantly, a fresh ranking replaces it quietly.
  useEffect(() => {
    let off = false;
    refreshSuggestions(tx.id).then((fresh) => { if (!off) qc.setQueryData(suggestionsKey(tx.id), fresh); }).catch(() => {});
    return () => { off = true; };
  }, [tx.id, qc]);
  const openQ = useQuery({ queryKey: ["finance", "reconcile-suggestions", "open", tx.id], queryFn: () => fetchTxOpenBalance(tx.id) });
  const partnerQ = useQuery({
    queryKey: ["finance", "partner-transfer-hint", tx.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fin_partner_transfer_hint", { _tx_id: tx.id });
      if (error) throw error;
      return data as { holder: string; bank: string } | null;
    },
  });
  const cQ = useQuery({
    queryKey: ["finance", "reconcile-candidates", tx.id, debounced],
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase.rpc("fin_reconcile_candidates", { _tx_id: tx.id, _search: debounced || undefined });
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const txOpen = openQ.data ?? Math.abs(tx.amount);

  const rows = useMemo<Row[]>(() => {
    const pool = cQ.data ?? [];
    const originById = new Map(pool.map((c) => [c.ref_id, c.origin]));
    const sugg = dedupeSuggestions(sQ.data ?? []).map<Row>((s) => ({
      key: `s:${s.kind}:${s.ref_id}`, section: "suggestion", kind: s.kind, ref_id: s.ref_id, label: s.label,
      counterparty: s.counterparty, doc_date: s.doc_date, amount: s.amount, outstanding: s.outstanding,
      origin: originById.get(s.ref_id) ?? (s.kind === "sale" ? "sale" : s.kind === "entrada" ? "entrada" : "purchase"),
      confidence: s.confidence, reasons: s.reasons,
    }));
    const seen = new Set(sugg.map((s) => s.ref_id));
    const rest = pool.filter((c) => !seen.has(c.ref_id)).map<Row>((c) => ({
      key: `p:${c.kind}:${c.ref_id}`, section: "pool", kind: c.kind, ref_id: c.ref_id, label: c.label,
      counterparty: c.counterparty, doc_date: c.doc_date, amount: c.amount == null ? null : Number(c.amount),
      outstanding: c.outstanding == null ? null : Number(c.outstanding), origin: c.origin,
    }));
    return [...sugg, ...rest];
  }, [sQ.data, cQ.data]);

  const [focus, setFocus] = useState(0);
  const [preview, setPreview] = useState<Row | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const focused = rows[focus] ?? null;
  useEffect(() => { if (focus >= rows.length) setFocus(Math.max(0, rows.length - 1)); }, [rows.length, focus]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  const selectedDocs = useMemo(() => {
    const byRef = new Map<string, Row>();
    rows.forEach((r) => { if (checked.has(r.ref_id) && isDoc(r.kind)) byRef.set(r.ref_id, r); });
    return [...byRef.values()];
  }, [rows, checked]);
  const split = useMemo(
    () => allocateSplit(txOpen, selectedDocs.map((d) => ({ id: d.ref_id, outstanding: Number(d.outstanding ?? 0) }))),
    [txOpen, selectedDocs],
  );

  function done() {
    for (const k of ["bank-tx", "bank-tx-links", "bank-tx-counts", "period-window", "reconcile-candidates", "reconcile-suggestions", "review-queue"]) {
      qc.invalidateQueries({ queryKey: ["finance", k] });
    }
    onMatched();
  }

  async function pay(docId: string, amount: number) {
    await addPayment.mutateAsync({
      document_id: docId, bank_transaction_id: tx.id, amount, payment_date: tx.transaction_date,
      method: "bank_transfer", created_by: user?.id ?? null,
    });
    await learnFromMatch(tx.id, docId);
  }

  async function matchRow(r: Row) {
    if (busy) return;
    if (r.kind === "entrada") { onConfirmEntrada(r.ref_id); return; }
    if (r.kind === "reimbursement") { onMatchReimb(); return; }
    if (r.kind === "transfer") { onMarkTransfer(); return; }
    const amount = Math.round(Math.min(Number(r.outstanding ?? 0), txOpen) * 100) / 100;
    if (amount <= 0) { toast.error(t("finance:reconSuggest.nothingOpen")); return; }
    setBusy(true);
    try {
      await pay(r.ref_id, amount);
      toast.success(t("finance:matchPanel.matched", { amount: fmt(amount) }));
      done();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function matchSelected() {
    if (busy || split.allocations.length === 0) return;
    setBusy(true);
    try {
      for (const a of split.allocations) await pay(a.id, a.amount);
      toast.success(t("finance:matchPanel.matchedSplit", { count: split.allocations.length, amount: fmt(split.total) }));
      setChecked(new Set());
      done();
    } catch (e) {
      toast.error((e as Error).message);
      done();
    } finally { setBusy(false); }
  }

  // Keyboard: ↑/↓ choose, Enter match, N next. Ignored while typing (except arrows/Enter in the search box).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const inSearch = el?.dataset?.matchSearch === "1";
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.getAttribute("role") === "combobox");
      if (typing && !inSearch) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => Math.min(rows.length - 1, f + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (e.key === "Enter" && focused) { e.preventDefault(); void matchRow(focused); }
      else if (!inSearch && (e.key === "n" || e.key === "N")) { e.preventDefault(); onNext(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const previewRow = preview ?? focused;
  const pv = useFilePreview(previewRow);
  const partial = txOpen > 0.005 && txOpen < Math.abs(tx.amount) - 0.005;
  const firstPoolIdx = rows.findIndex((r) => r.section === "pool");
  const nSugg = rows.filter((r) => r.section === "suggestion").length;

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_300px] gap-3">
      <div className="border rounded-md bg-card min-w-0">
        <div className="p-2 border-b flex items-center gap-2">
          <Sparkles className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{t("finance:matchPanel.title")}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">{t("finance:matchPanel.keys")} · {t("finance:reconSuggest.neverAuto")}</span>
        </div>
        {partnerQ.data && (
          <div className="p-2 border-b text-xs flex items-center gap-2">
            <Badge variant="outline">{t("finance:knownBank.partnerTransfer")}</Badge>
            <span>{partnerQ.data.holder} · {partnerQ.data.bank}</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={onMarkTransfer}>
              {t("finance:knownBank.reviewTransfer")}
            </Button>
          </div>
        )}
        {partial && (
          <p className="px-2 py-1 text-[11px] bg-muted/50">{t("finance:reconSuggest.txOpen", { open: fmt(txOpen), total: fmt(Math.abs(tx.amount)) })}</p>
        )}
        <div ref={listRef} className="max-h-[520px] overflow-auto">
          <SectionHeader label={t("finance:reconSuggest.title")} />
          {sQ.isLoading ? (
            <p className="p-3 text-xs text-muted-foreground">{t("common:loading")}</p>
          ) : sQ.isError ? (
            <p className="p-3 text-xs text-destructive">{t("finance:matchPanel.suggestError")}</p>
          ) : nSugg === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{t("finance:reconSuggest.none")}</p>
          ) : null}
          {rows.map((r, i) => (
            <div key={r.key}>
              {i === firstPoolIdx && (
                <div className="border-t">
                  <SectionHeader label={t("finance:candidatePool.title")} />
                  <div className="px-2 pb-2 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                    <Input data-match-search="1" className="h-7 pl-7 text-xs" value={search} onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("finance:matchPanel.search") as string} />
                  </div>
                </div>
              )}
              <MatchRow
                r={r} idx={i} active={i === focus} txOpen={txOpen}
                checked={checked.has(r.ref_id)}
                onCheck={(v) => setChecked((s) => { const n = new Set(s); if (v) n.add(r.ref_id); else n.delete(r.ref_id); return n; })}
                onFocus={() => { setFocus(i); setPreview(r); }}
                onHover={() => setPreview(r)}
                onMatch={() => void matchRow(r)}
                disabled={busy}
              />
            </div>
          ))}
          {firstPoolIdx === -1 && !cQ.isLoading && (
            <div className="border-t">
              <SectionHeader label={t("finance:candidatePool.title")} />
              <div className="px-2 pb-2 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input data-match-search="1" className="h-7 pl-7 text-xs" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("finance:matchPanel.search") as string} />
              </div>
              <p className="p-3 text-xs text-muted-foreground">{t("finance:candidatePool.empty")}</p>
            </div>
          )}
          {cQ.isLoading && <p className="p-3 text-xs text-muted-foreground">{t("common:loading")}</p>}
        </div>
        {selectedDocs.length > 0 && (
          <div className="p-2 border-t flex flex-wrap items-center gap-3 text-xs bg-muted/40">
            <span>{t("finance:matchPanel.selected", { count: selectedDocs.length })}</span>
            <span className="tabular-nums">{t("finance:matchPanel.runningTotal")}: <b>{fmt(split.selectedTotal)}</b> / {fmt(txOpen)}</span>
            <span className={`tabular-nums ${Math.abs(split.remainder) < 0.005 ? "text-emerald-700" : "text-amber-700"}`}>
              {t("finance:matchPanel.remainder")}: {fmt(split.remainder)}
            </span>
            <Button size="sm" className="h-7 ml-auto text-xs" disabled={busy || split.allocations.length === 0} onClick={() => void matchSelected()}>
              {t("finance:matchPanel.matchSelected")}
            </Button>
          </div>
        )}
        <div className="p-2 border-t flex justify-end">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onNext}>
            {t("finance:matchPanel.next")} <ChevronRight className="size-3.5 ml-1" />
          </Button>
        </div>
      </div>

      <div className="border rounded-md bg-card min-h-[300px] flex flex-col">
        <div className="p-2 border-b text-xs font-medium flex items-center gap-1.5 truncate">
          <FileText className="size-3.5 text-muted-foreground" />
          <span className="truncate">{previewRow ? `${previewRow.label}${previewRow.counterparty ? ` · ${previewRow.counterparty}` : ""}` : t("finance:matchPanel.preview")}</span>
        </div>
        <div className="flex-1 p-2 overflow-auto">
          {!previewRow ? (
            <p className="text-xs text-muted-foreground">{t("finance:matchPanel.previewHint")}</p>
          ) : pv.isLoading ? (
            <p className="text-xs text-muted-foreground">{t("common:loading")}</p>
          ) : !pv.data ? (
            <p className="text-xs text-muted-foreground">{t("finance:matchPanel.noFile")}</p>
          ) : pv.data.pdf ? (
            <PdfCanvasPreview url={pv.data.url} className="w-full" />
          ) : (
            <img src={pv.data.url} alt={previewRow.label} className="w-full h-auto" />
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>;
}

function MatchRow({
  r, idx, active, txOpen, checked, onCheck, onFocus, onHover, onMatch, disabled,
}: {
  r: Row; idx: number; active: boolean; txOpen: number; checked: boolean;
  onCheck: (v: boolean) => void; onFocus: () => void; onHover: () => void; onMatch: () => void; disabled: boolean;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const open = Number(r.outstanding ?? r.amount ?? 0);
  const diff = Math.round((Math.abs(open) - txOpen) * 100) / 100;
  const exact = Math.abs(diff) < 0.01;
  const tone = r.confidence == null ? null : confidenceTone(r.confidence);
  const confCls = tone === "high" ? "border-emerald-600 text-emerald-700" : tone === "medium" ? "border-amber-500 text-amber-700" : "text-muted-foreground";
  const action = r.kind === "entrada" ? t("finance:reconSuggest.confirmAndMatch")
    : r.kind === "transfer" ? t("finance:candidatePool.markTransfer") : t("finance:candidatePool.match");
  return (
    <div
      data-idx={idx}
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onFocus}
      className={`px-2 py-1.5 grid grid-cols-[16px_minmax(0,1fr)_auto] gap-2 items-center text-xs cursor-pointer border-l-2 ${active ? "bg-muted/60 border-primary" : "border-transparent hover:bg-muted/30"}`}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {isDoc(r.kind) ? <Checkbox checked={checked} onCheckedChange={(v) => onCheck(v === true)} aria-label={t("finance:matchPanel.selectForSplit") as string} /> : null}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge variant="secondary" className="text-[10px] shrink-0">{t(`finance:matchPanel.origin.${r.origin}`)}</Badge>
          <span className="font-medium truncate">{r.counterparty ?? "—"}</span>
          <span className="text-muted-foreground truncate">· {r.label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
          <span>{r.doc_date ?? "—"}</span>
          <span>{t("finance:matchPanel.total")} {fmt(r.amount)}</span>
          <span>{t("finance:reconSuggest.open")} {fmt(r.outstanding)}</span>
          <span className={exact ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
            {exact ? t("finance:matchPanel.diffExact") : t("finance:matchPanel.diff", { diff: `${diff > 0 ? "+" : ""}${fmt(diff)}` })}
          </span>
        </div>
        {r.confidence != null && (
          <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={`text-[10px] tabular-nums py-0 ${confCls}`}>{r.confidence}%</Badge>
            {reasonLine(r.reasons ?? [], t as never, fmt)}
          </div>
        )}
      </div>
      <Button size="sm" variant={active ? "default" : "outline"} className="h-6 text-[11px]" disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onMatch(); }}>
        {action}
      </Button>
    </div>
  );
}
