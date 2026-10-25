import { translateError } from '@/lib/translate-error';
import uiI18n from "@/i18n/index";
/**
 * Reconciliation audit trail (stage D). Written only by database triggers on
 * payments and bank movements; this file only reads it.
 *  - ReconcileHistory: compact history for one movement or one document, each
 *    entry linking to the other side.
 *  - ReconcileAuditRegister: the searchable "Registo de reconciliações".
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type AuditRow = {
  id: string; created_at: string; action: string; amount: number | null; detail: Record<string, unknown>;
  actor_email: string | null; bank_transaction_id: string | null; tx_date: string | null; tx_description: string | null;
  tx_amount: number | null; bank_account_id: string | null; document_id: string | null; document_number: string | null;
  counterparty: string | null; document_total: number | null;
};

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat(uiI18n.language, { style: "currency", currency: "EUR" }).format(Number(n));
const when = (iso: string) => new Date(iso).toLocaleString(uiI18n.language, { dateStyle: "short", timeStyle: "short" });

export async function fetchAudit(p: { q?: string; from?: string; to?: string; tx?: string; doc?: string; limit?: number }): Promise<AuditRow[]> {
  const { data, error } = await supabase.rpc("fin_reconcile_audit_search", {
    _q: p.q || undefined, _from: p.from || undefined, _to: p.to || undefined,
    _tx: p.tx || undefined, _doc: p.doc || undefined, _limit: p.limit ?? 200,
  });
  if (error) throw error;
  return (data ?? []) as unknown as AuditRow[];
}

function ActionBadge({ a }: { a: string }) {
  const { t } = useTranslation("finance");
  const tone = a === "match" || a === "reconciled" ? "default" : a === "unmatch" || a === "unreconciled" ? "destructive" : "secondary";
  return <Badge variant={tone as never} className="text-[10px]">{t(`finance:reconAudit.action.${a}`, { defaultValue: a })}</Badge>;
}

function Detail({ r }: { r: AuditRow }) {
  const { t } = useTranslation("finance");
  const d = r.detail ?? {};
  if (r.action === "status_change" || r.action === "reconciled" || r.action === "unreconciled") {
    return <span>{t("finance:reconAudit.statusFromTo", { from: String(d.from ?? "—"), to: String(d.to ?? "—") })}</span>;
  }
  if (r.action === "amount_change") return <span>{t("finance:reconAudit.amountFromTo", { from: eur(d.old_amount as number), to: eur(r.amount) })}</span>;
  return <span>{eur(r.amount)}</span>;
}

function TxLink({ r }: { r: AuditRow }) {
  if (!r.bank_transaction_id) return <span>—</span>;
  return (
    <a className="underline underline-offset-2" href={`/finance/banking/reconciliation?tx=${r.bank_transaction_id}`}>
      {r.tx_date} · {r.tx_description ?? "—"} · {eur(r.tx_amount)}
    </a>
  );
}

function DocLink({ r }: { r: AuditRow }) {
  if (!r.document_id) return <span>—</span>;
  return (
    <Link className="underline underline-offset-2" to="/finance/documents/$documentId" params={{ documentId: r.document_id }}>
      {r.counterparty ?? "—"} · {r.document_number ?? "—"} · {eur(r.document_total)}
    </Link>
  );
}

/** History for one movement (links to documents) or one document (links to movements). */
export function ReconcileHistory({ txId, docId }: { txId?: string; docId?: string }) {
  const { t } = useTranslation("finance");
  const q = useQuery({
    queryKey: ["finance", "reconcile-audit", txId ?? null, docId ?? null],
    queryFn: () => fetchAudit({ tx: txId, doc: docId, limit: 50 }),
  });
  const rows = q.data ?? [];
  return (
    <div className="border rounded-md bg-card">
      <div className="p-2 border-b flex items-center gap-2 text-xs font-medium">
        <History className="size-3.5 text-muted-foreground" />{t("finance:reconAudit.historyTitle")}
        <Link to="/finance/banking/reconciliation-log" className="ml-auto text-[11px] text-muted-foreground underline">{t("finance:reconAudit.openRegister")}</Link>
      </div>
      {q.isLoading ? <p className="p-2 text-xs text-muted-foreground">{t("common:loading")}</p>
        : rows.length === 0 ? <p className="p-2 text-xs text-muted-foreground">{t("finance:reconAudit.empty")}</p>
        : (
          <ul className="divide-y text-xs">
            {rows.map((r) => (
              <li key={r.id} className="p-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="tabular-nums text-muted-foreground">{when(r.created_at)}</span>
                <ActionBadge a={r.action} />
                <Detail r={r} />
                <span className="text-muted-foreground">· {r.actor_email ?? t("finance:reconAudit.system")}</span>
                <span className="basis-full truncate">{txId ? <DocLink r={r} /> : <TxLink r={r} />}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

export function ReconcileAuditRegister() {
  const { t } = useTranslation("finance");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useQuery({
    queryKey: ["finance", "reconcile-audit", "register", q, from, to],
    queryFn: () => fetchAudit({ q: q.trim(), from, to, limit: 500 }),
  });
  const rows = query.data ?? [];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("finance:reconAudit.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("finance:reconAudit.subtitle")}</p>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input className="pl-7 h-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("finance:reconAudit.search") as string} />
            </div>
            <Input type="date" className="h-8 w-40 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("finance:reconAudit.from") as string} />
            <Input type="date" className="h-8 w-40 text-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("finance:reconAudit.to") as string} />
            <span className="text-xs font-normal text-muted-foreground">{t("finance:reconAudit.count", { count: rows.length })}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6" />)}</div>
            : query.error ? <p className="p-4 text-sm text-destructive">{translateError((query.error as Error).message)}</p>
            : rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("finance:reconAudit.empty")}</p>
            : (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="p-2 text-left">{t("finance:reconAudit.col.when")}</th>
                      <th className="p-2 text-left">{t("finance:reconAudit.col.action")}</th>
                      <th className="p-2 text-left">{t("finance:reconAudit.col.detail")}</th>
                      <th className="p-2 text-left">{t("finance:reconAudit.col.movement")}</th>
                      <th className="p-2 text-left">{t("finance:reconAudit.col.document")}</th>
                      <th className="p-2 text-left">{t("finance:reconAudit.col.who")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b align-top">
                        <td className="p-2 tabular-nums whitespace-nowrap">{when(r.created_at)}</td>
                        <td className="p-2"><ActionBadge a={r.action} /></td>
                        <td className="p-2 tabular-nums"><Detail r={r} /></td>
                        <td className="p-2"><TxLink r={r} /></td>
                        <td className="p-2"><DocLink r={r} /></td>
                        <td className="p-2">{r.actor_email ?? t("finance:reconAudit.system")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
