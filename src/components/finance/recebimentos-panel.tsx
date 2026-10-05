/**
 * Incoming payments (recebimentos): each groups the proofs of one payment,
 * the bank credit line and what it pays. Suggestions only; "Confirmar" is the
 * single action that marks invoices/schedule items paid, reconciles the bank
 * line and files the proofs.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PdfCanvasPreview } from "@/components/finance/pdf-preview";
import { confirmRecebimento, listClientOpenTargets, setRecebimentoClient } from "@/lib/finance/recebimentos.functions";

type TargetItem = {
  kind: "pm_invoice" | "schedule_item" | "issued_document";
  id: string; label: string; amount: number; date: string | null; projectId: string | null; projectName?: string | null;
};
type TargetSuggestion = { items: TargetItem[]; total: number; exact: boolean; hint: string | null };
type Rec = {
  id: string; company_id: string | null; client_match_method: string | null; client_match_detail: string | null;
  payer_name: string | null; payer_vat: string | null; payer_iban: string | null;
  amount: number; received_date: string; description: string | null; status: "suggested" | "confirmed";
  suggested_bank_transaction_ids: string[]; suggested_targets: TargetSuggestion[];
  bank_transaction_ids: string[]; pm_invoice_ids: string[]; schedule_item_ids: string[]; financial_document_ids: string[];
  project_ids: string[]; confirmed_at: string | null;
};
type Proof = {
  id: string; recebimento_id: string; intake_type: string | null; original_filename: string | null;
  source_bucket: string | null; source_file_url: string; extracted_amount: number | null; extracted_date: string | null; status: string;
};
type Tx = { id: string; transaction_date: string; amount: number; description: string | null; bank_account_id: string };

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v));

function useRecebimentos(filter: { projectId?: string; companyId?: string; onlyConfirmed?: boolean }) {
  return useQuery({
    queryKey: ["finance", "recebimentos", filter],
    queryFn: async () => {
      let q = supabase.from("finance_recebimentos").select("*").order("received_date", { ascending: false });
      if (filter.projectId) q = q.contains("project_ids", [filter.projectId]);
      if (filter.companyId) q = q.eq("company_id", filter.companyId);
      if (filter.onlyConfirmed) q = q.eq("status", "confirmed");
      const { data, error } = await q;
      if (error) throw error;
      const recs = (data ?? []) as unknown as Rec[];
      const ids = recs.map((r) => r.id);
      const txIds = [...new Set(recs.flatMap((r) => [...r.bank_transaction_ids, ...r.suggested_bank_transaction_ids]))];
      const companyIds = [...new Set(recs.map((r) => r.company_id).filter(Boolean))] as string[];
      const [proofs, txs, companies] = await Promise.all([
        ids.length
          ? supabase.from("financial_document_review_queue")
              .select("id, recebimento_id, intake_type, original_filename, source_bucket, source_file_url, extracted_amount, extracted_date, status")
              .in("recebimento_id", ids)
          : Promise.resolve({ data: [] }),
        txIds.length
          ? supabase.from("bank_transactions").select("id, transaction_date, amount, description, bank_account_id").in("id", txIds)
          : Promise.resolve({ data: [] }),
        companyIds.length ? supabase.from("companies").select("id, nome, nif").in("id", companyIds) : Promise.resolve({ data: [] }),
      ]);
      return {
        recs,
        proofs: ((proofs as { data: unknown[] | null }).data ?? []) as Proof[],
        txs: ((txs as { data: unknown[] | null }).data ?? []) as Tx[],
        companies: ((companies as { data: unknown[] | null }).data ?? []) as Array<{ id: string; nome: string; nif: string | null }>,
      };
    },
  });
}

function ProofPreview({ p }: { p: Proof }) {
  const { t } = useTranslation(["finance"]);
  const [url, setUrl] = useState<string | null>(null);
  const isPdf = p.source_file_url?.toLowerCase().endsWith(".pdf");
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    (async () => {
      const { data: blob } = await supabase.storage.from(p.source_bucket || "financial-documents").download(p.source_file_url);
      if (!blob || !alive) return;
      const typed = blob.type && blob.type !== "application/octet-stream" ? blob : new Blob([blob], { type: isPdf ? "application/pdf" : "image/jpeg" });
      made = URL.createObjectURL(typed);
      setUrl(made);
    })();
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [p.id, p.source_bucket, p.source_file_url, isPdf]);
  return (
    <div className="rounded-md border p-2 space-y-1 min-w-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <Badge variant="outline" className="text-[10px]">{t(`finance:intakeInbox.types.${p.intake_type ?? "desconhecido"}`, { defaultValue: p.intake_type ?? "—" })}</Badge>
        <span className="tabular-nums">{fmt(p.extracted_amount)} · {p.extracted_date ?? "—"}</span>
      </div>
      <div className="text-[11px] text-muted-foreground truncate">{p.original_filename ?? "—"}</div>
      {!url ? <Skeleton className="h-48 w-full" /> : isPdf ? (
        <PdfCanvasPreview url={url} className="h-64 overflow-y-auto" />
      ) : (
        <img src={url} alt={p.original_filename ?? ""} className="max-h-64 mx-auto" />
      )}
      {url && <a href={url} target="_blank" rel="noreferrer" className="text-[11px] underline">{t("finance:recebimentos.openFile")}</a>}
    </div>
  );
}

export function RecebimentosPanel() {
  const { t } = useTranslation(["finance"]);
  const q = useRecebimentos({});
  const [show, setShow] = useState<"suggested" | "confirmed">("suggested");
  const list = (q.data?.recs ?? []).filter((r) => r.status === show);
  const counts = useMemo(() => ({
    suggested: (q.data?.recs ?? []).filter((r) => r.status === "suggested").length,
    confirmed: (q.data?.recs ?? []).filter((r) => r.status === "confirmed").length,
  }), [q.data]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("finance:recebimentos.hint")}</p>
      <div className="flex gap-2">
        {(["suggested", "confirmed"] as const).map((k) => (
          <Button key={k} size="sm" variant={show === k ? "default" : "outline"} onClick={() => setShow(k)}>
            {t(`finance:recebimentos.status.${k}`)}
            <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts[k]}</Badge>
          </Button>
        ))}
      </div>
      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {!q.isLoading && list.length === 0 && <p className="text-sm text-muted-foreground">{t("finance:recebimentos.empty")}</p>}
      {list.map((r) => (
        <RecebimentoCard
          key={r.id}
          rec={r}
          proofs={(q.data?.proofs ?? []).filter((p) => p.recebimento_id === r.id)}
          txs={q.data?.txs ?? []}
          company={(q.data?.companies ?? []).find((c) => c.id === r.company_id) ?? null}
        />
      ))}
    </div>
  );
}

function RecebimentoCard({ rec, proofs, txs, company }: { rec: Rec; proofs: Proof[]; txs: Tx[]; company: { id: string; nome: string; nif: string | null } | null }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const confirm = useServerFn(confirmRecebimento);
  const setClient = useServerFn(setRecebimentoClient);
  const listTargets = useServerFn(listClientOpenTargets);
  const confirmed = rec.status === "confirmed";
  const sugg = rec.suggested_targets ?? [];
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(rec.received_date);
  const [bankIds, setBankIds] = useState<string[]>(confirmed ? rec.bank_transaction_ids : rec.suggested_bank_transaction_ids.slice(0, 1));
  const [targets, setTargets] = useState<TargetItem[]>(sugg[0]?.items ?? []);

  const companiesQ = useQuery({
    queryKey: ["finance", "companies", "clients-picker"],
    enabled: editing,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, nome, nif").eq("is_active", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const openQ = useQuery({
    queryKey: ["finance", "recebimentos", "open-targets", rec.company_id],
    enabled: editing && !!rec.company_id,
    queryFn: () => listTargets({ data: { companyId: rec.company_id! } }) as Promise<TargetItem[]>,
  });
  const clientM = useMutation({
    mutationFn: (companyId: string) => setClient({ data: { id: rec.id, companyId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "recebimentos"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const m = useMutation({
    mutationFn: () => confirm({ data: { id: rec.id, companyId: rec.company_id!, date, bankTransactionIds: bankIds, targets: targets.map((x) => ({ kind: x.kind, id: x.id })) } }),
    onSuccess: (r) => {
      toast.success(r.unallocated > 0.01 ? t("finance:recebimentos.doneUnallocated", { amount: fmt(r.unallocated) }) : t("finance:recebimentos.done"));
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const txOf = (id: string) => txs.find((x) => x.id === id);
  const toggleTarget = (it: TargetItem) =>
    setTargets((cur) => (cur.some((c) => c.id === it.id) ? cur.filter((c) => c.id !== it.id) : [...cur, it]));
  const targetTotal = targets.reduce((s, x) => s + x.amount, 0);
  const shownBank = confirmed ? rec.bank_transaction_ids : rec.suggested_bank_transaction_ids;

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">
            {company?.nome ?? rec.payer_name ?? t("finance:recebimentos.unknownClient")}
            <span className="ml-2 tabular-nums">{fmt(rec.amount)}</span>
            <span className="ml-2 text-xs text-muted-foreground">{rec.received_date}</span>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {rec.client_match_method ? (
              <Badge variant="secondary" className="text-[10px]">{t(`finance:recebimentos.matchBy.${rec.client_match_method}`)}{rec.client_match_detail ? ` · ${rec.client_match_detail}` : ""}</Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">{t("finance:recebimentos.askClient")}</Badge>
            )}
            <Badge variant={confirmed ? "default" : "outline"} className="text-[10px]">{t(`finance:recebimentos.status.${rec.status}`)}</Badge>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {t("finance:recebimentos.payer")}: {rec.payer_name ?? "—"}{rec.payer_vat ? ` · NIF ${rec.payer_vat}` : ""}{rec.payer_iban ? ` · ${rec.payer_iban}` : ""}
          {rec.description ? ` · “${rec.description}”` : ""}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs">{t("finance:recebimentos.proofs", { count: proofs.length })}</Label>
          <div className="mt-1 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {proofs.map((p) => <ProofPreview key={p.id} p={p} />)}
          </div>
        </div>

        <div>
          <Label className="text-xs">{t("finance:recebimentos.bankLine")}</Label>
          {shownBank.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("finance:recebimentos.noBankLine")}</p>
          ) : (
            <div className="mt-1 space-y-1">
              {shownBank.map((id) => {
                const x = txOf(id);
                return (
                  <label key={id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    {!confirmed && <Checkbox checked={bankIds.includes(id)} onCheckedChange={(v) => setBankIds((c) => (v ? [...c, id] : c.filter((y) => y !== id)))} />}
                    <span className="tabular-nums">{x?.transaction_date ?? "—"}</span>
                    <span className="truncate flex-1">{x?.description ?? "—"}</span>
                    <span className="tabular-nums">{fmt(x?.amount)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <Label className="text-xs">{t("finance:recebimentos.pays")}</Label>
          {confirmed ? (
            <p className="text-sm">{t("finance:recebimentos.confirmedCount", { count: rec.pm_invoice_ids.length + rec.schedule_item_ids.length + rec.financial_document_ids.length })}</p>
          ) : (
            <div className="mt-1 space-y-1">
              {sugg.length === 0 && !editing && <p className="text-sm text-muted-foreground">{t("finance:recebimentos.noTarget")}</p>}
              {!editing && sugg.map((s, i) => {
                const selected = s.items.length === targets.length && s.items.every((it) => targets.some((x) => x.id === it.id));
                return (
                  <button key={i} onClick={() => setTargets(s.items)} className={`w-full text-left rounded-md border p-2 text-sm ${selected ? "border-primary bg-accent" : "hover:bg-accent/50"}`}>
                    {s.items.map((it) => (
                      <div key={it.id} className="flex justify-between gap-2">
                        <span className="truncate">{t(`finance:recebimentos.kind.${it.kind}`)} · {it.label}{it.projectName ? ` · ${it.projectName}` : ""}</span>
                        <span className="tabular-nums">{fmt(it.amount)}</span>
                      </div>
                    ))}
                    <div className="mt-1 flex gap-1">
                      {s.items.length > 1 && <Badge variant="secondary" className="text-[10px]">{t("finance:recebimentos.combination")}</Badge>}
                      {s.hint && <Badge variant="secondary" className="text-[10px]">{s.hint === "adjudicacao" ? t("finance:recebimentos.hintAward") : t("finance:recebimentos.hintRef", { ref: s.hint.slice(4) })}</Badge>}
                    </div>
                  </button>
                );
              })}
              {editing && (
                <div className="space-y-2 rounded-md border p-2">
                  <div>
                    <Label className="text-xs">{t("finance:recebimentos.client")}</Label>
                    <Select value={rec.company_id ?? ""} onValueChange={(v) => clientM.mutate(v)}>
                      <SelectTrigger><SelectValue placeholder={t("finance:recebimentos.pickClient")} /></SelectTrigger>
                      <SelectContent>
                        {(companiesQ.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.nif ? ` · ${c.nif}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {(openQ.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">{t("finance:recebimentos.noOpen")}</p>}
                  {(openQ.data ?? []).map((it) => (
                    <label key={it.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={targets.some((x) => x.id === it.id)} onCheckedChange={() => toggleTarget(it)} />
                      <span className="truncate flex-1">{t(`finance:recebimentos.kind.${it.kind}`)} · {it.label}{it.projectName ? ` · ${it.projectName}` : ""} · {it.date ?? "—"}</span>
                      <span className="tabular-nums">{fmt(it.amount)}</span>
                    </label>
                  ))}
                </div>
              )}
              {targets.length > 0 && Math.abs(targetTotal - rec.amount) > 0.01 && (
                <p className="text-xs text-destructive">{t("finance:recebimentos.totalDiffers", { total: fmt(targetTotal) })}</p>
              )}
            </div>
          )}
        </div>

        {!confirmed && (
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">{t("finance:recebimentos.date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <Button size="sm" disabled={!rec.company_id || m.isPending} onClick={() => m.mutate()}>
              {m.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              {t("finance:recebimentos.confirm")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-4 w-4 mr-1.5" />{t("finance:recebimentos.change")}
            </Button>
            {!rec.company_id && <span className="text-xs text-muted-foreground">{t("finance:recebimentos.needClient")}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Read-only list for the project page and the client's CRM page. */
export function PaymentsReceived({ projectId, companyId }: { projectId?: string; companyId?: string }) {
  const { t } = useTranslation(["finance"]);
  const q = useRecebimentos({ projectId, companyId, onlyConfirmed: !!projectId });
  const recs = q.data?.recs ?? [];
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">{t("finance:recebimentos.receivedTitle")}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {q.isLoading && <Skeleton className="h-16 w-full" />}
        {!q.isLoading && recs.length === 0 && <p className="text-sm text-muted-foreground">{t("finance:recebimentos.receivedEmpty")}</p>}
        {recs.map((r) => {
          const proofs = (q.data?.proofs ?? []).filter((p) => p.recebimento_id === r.id);
          return (
            <details key={r.id} className="rounded-md border p-2 text-sm">
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span>{r.received_date} · {r.payer_name ?? "—"}</span>
                <span className="flex items-center gap-2">
                  <Badge variant={r.status === "confirmed" ? "default" : "outline"} className="text-[10px]">{t(`finance:recebimentos.status.${r.status}`)}</Badge>
                  <span className="tabular-nums">{fmt(r.amount)}</span>
                </span>
              </summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {proofs.map((p) => <ProofPreview key={p.id} p={p} />)}
              </div>
            </details>
          );
        })}
      </CardContent>
    </Card>
  );
}
