/**
 * Finance intake inbox — one place for every incoming document, split by the
 * destination its type routes to. Nothing here is automatic: each tab only
 * offers suggestions that a person confirms.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, Clock, Loader2, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PdfCanvasPreview } from "@/components/finance/pdf-preview";
import { QueueItemCard, type QueueRow } from "@/components/finance/review-queue";
import {
  reclassifyQueueItem,
  confirmPaymentMatch,
  fileBankDocument,
  retryBankDriveCopy,
  markOtherDocumentFiled,
} from "@/lib/finance/intake-inbox.functions";

const TABS = ["triage", "purchases", "payments", "bank", "issued", "other", "ignored"] as const;
type Tab = (typeof TABS)[number];

export const INTAKE_TYPES = [
  "fatura_compra", "nota_credito", "recibo", "comprovativo_pagamento", "extrato_bancario",
  "nota_lancamento", "fatura_emitida", "documento_fiscal", "contrato_outro", "nao_financeiro", "desconhecido",
] as const;
type IntakeType = (typeof INTAKE_TYPES)[number];

const CHECKED = ["supplier_vat", "document_number", "issue_date", "amount_ex_vat", "vat_amount", "total_amount", "iban", "account_number"] as const;

type FieldCheck = {
  status: "ok" | "verify";
  value: string | number | null;
  claude?: string | number | null;
  gemini?: string | number | null;
  reasons: string[];
};

type InboxRow = QueueRow & {
  intake_type: IntakeType | null;
  intake_type_confidence: number | null;
  intake_type_source: "ai" | "manual";
  intake_type_reason: string | null;
  intake_route: string | null;
  verification: "full" | "partial" | "none" | "single" | null;
  split_part: number | null;
  split_page_first: number | null;
  split_page_last: number | null;
  field_checks: Record<string, FieldCheck> | null;
  retry_after: string | null;
  extracted_base_amount: number | null;
  extracted_iban: string | null;
  extracted_account_number: string | null;
  matched_bank_account_id: string | null;
  bank_period: string | null;
  credit_note_original_document_id: string | null;
  payment_match_document_id: string | null;
  payment_match_candidates: Array<{
    id: string; document_number: string | null; issue_date: string | null; due_date: string | null;
    total: number; open: number; supplier: string | null; exact_amount: boolean;
  }> | null;
};

function tabOf(r: InboxRow): Tab {
  const route = r.intake_route;
  if (!route || route === "retry") return "triage";
  return route as Tab;
}

function fmt(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v));
}

export function IntakeInbox() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const isPt = !!i18n.language?.startsWith("pt");
  const [tab, setTab] = useState<Tab>("triage");
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();

  const rowsQ = useQuery({
    queryKey: ["finance", "review-queue", "inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_document_review_queue")
        .select("*")
        // Filed / paid items stay visible in their tab with their status.
        .in("status", ["pending_review", "filed", "paid"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InboxRow[];
    },
  });
  const ignoredEmailsQ = useQuery({
    queryKey: ["finance", "email-ignored", "inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_email_ignored_items")
        .select("id, subject, from_address, attachment_filename, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: tab === "ignored",
  });

  const classificationsQ = useQuery({
    queryKey: ["finance", "classifications", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_classifications").select("id, code, name_pt, name_en").eq("active", true).order("code");
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
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const byTab = useMemo(() => {
    const m: Record<Tab, InboxRow[]> = { triage: [], purchases: [], payments: [], bank: [], issued: [], other: [], ignored: [] };
    for (const r of rowsQ.data ?? []) m[tabOf(r)].push(r);
    return m;
  }, [rowsQ.data]);

  const list = byTab[tab];
  const active = list.find((r) => r.id === selected) ?? list[0] ?? null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("finance:intakeInbox.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("finance:intakeInbox.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["finance", "review-queue"] })}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          {t("common:actions.refresh", { defaultValue: "Refresh" })}
        </Button>
      </header>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setSelected(null); }}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {t(`finance:intakeInbox.tabs.${k}`)}
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{byTab[k].filter((r) => r.status === "pending_review").length}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardContent className="space-y-1.5 max-h-[680px] overflow-auto pt-4">
            {rowsQ.isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            {!rowsQ.isLoading && list.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("finance:intakeInbox.empty")}</p>
            )}
            {list.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`w-full text-left rounded-md border p-2.5 text-sm transition-colors ${
                  active?.id === r.id ? "border-primary bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">
                    {r.extracted_seller_name ?? r.extracted_supplier_name ?? r.original_filename ?? "—"}
                  </span>
                  <span className="text-xs tabular-nums">{fmt(r.extracted_amount)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <TypeBadge row={r} />
                  <StatusBadges row={r} />
                  <span className="text-[10px] text-muted-foreground">{r.extracted_date ?? "—"}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {active ? (
            <ItemDetail
              key={active.id}
              row={active}
              tab={tab}
              isPt={isPt}
              classifications={classificationsQ.data ?? []}
              suppliers={suppliersQ.data ?? []}
              projects={projectsQ.data ?? []}
            />
          ) : (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("finance:intakeInbox.selectItem")}</CardContent></Card>
          )}
          {tab === "ignored" && (
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">{t("finance:reviewQueue.ignoredTitle")}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {(ignoredEmailsQ.data ?? []).map((r) => (
                  <div key={r.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{r.subject ?? "—"}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {t(`finance:intakeInbox.emailReason.${r.reason}`, { defaultValue: r.reason })}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.from_address ?? "—"}{r.attachment_filename ? ` · ${r.attachment_filename}` : ""}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ row }: { row: InboxRow }) {
  const { t } = useTranslation(["finance"]);
  const type = row.intake_type;
  return (
    <Badge variant="outline" className="text-[10px]">
      {type ? t(`finance:intakeInbox.types.${type}`) : t("finance:intakeInbox.notClassified")}
      {row.intake_type_confidence != null && row.intake_type_source === "ai" && (
        <span className="ml-1 text-muted-foreground">{Math.round(Number(row.intake_type_confidence) * 100)}%</span>
      )}
    </Badge>
  );
}

function StatusBadges({ row }: { row: InboxRow }) {
  const { t } = useTranslation(["finance"]);
  const verifyCount = Object.values(row.field_checks ?? {}).filter((c) => c?.status === "verify").length;
  const status = String(row.status);
  return (
    <>
      <Badge variant={status === "pending_review" ? "outline" : "default"} className="text-[10px]">
        {t(`finance:intakeInbox.status.${status === "pending_review" ? "pending" : status}`)}
      </Badge>
      {row.split_part != null && row.split_part > 0 && (
        <Badge variant="outline" className="text-[10px]">
          {t("finance:intakeInbox.splitPart", { n: row.split_part, first: row.split_page_first, last: row.split_page_last })}
        </Badge>
      )}
      {row.verification === "single" && (
        <Badge variant="secondary" className="text-[10px]">{t("finance:intakeInbox.single")}</Badge>
      )}
      {row.intake_route === "retry" && (
        <Badge variant="secondary" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />{t("finance:intakeInbox.retryPending")}</Badge>
      )}
      {row.verification === "partial" && (
        <Badge variant="secondary" className="text-[10px]">{t("finance:intakeInbox.partial")}</Badge>
      )}
      {verifyCount > 0 && (
        <Badge variant="destructive" className="text-[10px]">
          <AlertTriangle className="h-3 w-3 mr-1" />{t("finance:intakeInbox.verifyCount", { count: verifyCount })}
        </Badge>
      )}
    </>
  );
}

function ItemDetail({
  row, tab, isPt, classifications, suppliers, projects,
}: {
  row: InboxRow;
  tab: Tab;
  isPt: boolean;
  classifications: Array<{ id: string; code: string; name_pt: string; name_en: string }>;
  suppliers: Array<{ id: string; nome: string; nif: string | null; is_supplier: boolean }>;
  projects: Array<{ id: string; name: string }>;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const reclassify = useServerFn(reclassifyQueueItem);
  const reclassifyM = useMutation({
    mutationFn: (type: IntakeType) => reclassify({ data: { id: row.id, type } }),
    onSuccess: (res) => {
      if (res && !res.ok) toast.error(res.error ?? t("finance:intakeInbox.reclassifyFailed"));
      else toast.success(t("finance:intakeInbox.reclassified"));
      qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const reviewCardTabs: Tab[] = ["purchases", "issued"];

  return (
    <>
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge row={row} />
            <StatusBadges row={row} />
            {row.intake_type_source === "manual" && (
              <Badge variant="secondary" className="text-[10px]">{t("finance:intakeInbox.manualType")}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t("finance:intakeInbox.reclassify")}</Label>
            <Select
              value=""
              onValueChange={(v) => reclassifyM.mutate(v as IntakeType)}
              disabled={reclassifyM.isPending}
            >
              <SelectTrigger className="h-8 w-[210px]">
                <SelectValue placeholder={reclassifyM.isPending ? t("finance:intakeInbox.rerunning") : t("finance:intakeInbox.pickType")} />
              </SelectTrigger>
              <SelectContent>
                {INTAKE_TYPES.map((k) => (
                  <SelectItem key={k} value={k}>{t(`finance:intakeInbox.types.${k}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {row.intake_type_reason && <p className="text-xs text-muted-foreground">{row.intake_type_reason}</p>}
          {row.extraction_error && (
            <p className="text-xs text-destructive">
              {row.intake_route === "retry" ? t("finance:intakeInbox.retryHint") : t("finance:reviewQueue.extractionFailed")}
            </p>
          )}
          {tab === "triage" && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("finance:intakeInbox.triageAsk")}</p>
              <div className="flex flex-wrap gap-1.5">
                {INTAKE_TYPES.filter((k) => k !== "desconhecido").map((k) => (
                  <Button key={k} size="sm" variant="outline" disabled={reclassifyM.isPending} onClick={() => reclassifyM.mutate(k)}>
                    {t(`finance:intakeInbox.types.${k}`)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <FieldChecksPanel row={row} />
        </CardContent>
      </Card>

      {reviewCardTabs.includes(tab) ? (
        <>
          {row.intake_type === "nota_credito" && (
            <p className="text-xs text-muted-foreground">
              {row.credit_note_original_document_id
                ? t("finance:intakeInbox.creditNoteLinked")
                : t("finance:intakeInbox.creditNoteNoMatch")}
            </p>
          )}
          <QueueItemCard row={row} isPt={isPt} classifications={classifications} suppliers={suppliers} projects={projects} />
        </>
      ) : (
        <>
          {row.status === "pending_review" && tab === "payments" && <PaymentPanel row={row} />}
          {row.status === "pending_review" && tab === "bank" && <BankPanel row={row} />}
          {row.status === "pending_review" && tab === "other" && <OtherPanel row={row} />}
          <DocPreview row={row} />
        </>
      )}
    </>
  );
}

function FieldChecksPanel({ row }: { row: InboxRow }) {
  const { t } = useTranslation(["finance"]);
  const checks = row.field_checks;
  if (!checks) return null;
  const fields = CHECKED.filter((f) => {
    const c = checks[f];
    return c && (c.value != null || c.claude != null || c.gemini != null);
  });
  const typeCheck = checks.intake_type;
  if (fields.length === 0 && !typeCheck) return null;
  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[1.2fr_1fr_auto] gap-2 px-3 py-1.5 text-[11px] text-muted-foreground border-b">
        <span>{t("finance:intakeInbox.field")}</span>
        <span>{t("finance:intakeInbox.prefilled")}</span>
        <span />
      </div>
      {typeCheck?.status === "verify" && (
        <div className="px-3 py-1.5 text-xs text-destructive border-b">{t("finance:intakeInbox.reasons.direction_mismatch")}</div>
      )}
      {fields.map((f) => {
        const c = checks[f];
        const verify = c.status === "verify";
        return (
          <div key={f} className="grid grid-cols-[1.2fr_1fr_auto] gap-2 px-3 py-1.5 text-sm border-b last:border-b-0 items-start">
            <span className="text-muted-foreground">{t(`finance:intakeInbox.fields.${f}`)}</span>
            <div className="min-w-0">
              <span className="tabular-nums break-all">{c.value ?? "—"}</span>
              {verify && (
                <div className="text-[11px] text-muted-foreground space-y-0.5 mt-0.5">
                  {"claude" in c && <div>Claude: {c.claude ?? "—"}</div>}
                  {"gemini" in c && <div>Gemini: {c.gemini ?? "—"}</div>}
                  {c.reasons.filter((r) => r !== "single_model").map((r) => (
                    <div key={r}>{t(`finance:intakeInbox.reasons.${r}`)}</div>
                  ))}
                </div>
              )}
            </div>
            {verify ? (
              <Badge variant="destructive" className="text-[10px]">{t("finance:intakeInbox.verify")}</Badge>
            ) : (
              <Check className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocPreview({ row }: { row: InboxRow }) {
  const { t } = useTranslation(["finance"]);
  const [url, setUrl] = useState<string | null>(null);
  const isPdf = row.source_file_url?.toLowerCase().endsWith(".pdf");
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    (async () => {
      const { data: blob } = await supabase.storage.from(row.source_bucket || "financial-documents").download(row.source_file_url);
      if (!blob || !alive) return;
      const typed = blob.type && blob.type !== "application/octet-stream"
        ? blob
        : new Blob([blob], { type: isPdf ? "application/pdf" : "image/jpeg" });
      made = URL.createObjectURL(typed);
      setUrl(made);
    })();
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [row.id, row.source_bucket, row.source_file_url, isPdf]);
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">{t("finance:intakeInbox.preview")}</CardTitle></CardHeader>
      <CardContent>
        {!url ? <Skeleton className="h-[420px] w-full" /> : isPdf ? (
          <PdfCanvasPreview url={url} className="h-[520px] overflow-y-auto p-2" />
        ) : (
          <img src={url} alt={row.original_filename ?? ""} className="max-h-[520px] mx-auto" />
        )}
      </CardContent>
    </Card>
  );
}

function PaymentPanel({ row }: { row: InboxRow }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const confirm = useServerFn(confirmPaymentMatch);
  const candidates = row.payment_match_candidates ?? [];
  const [docId, setDocId] = useState<string | null>(row.payment_match_document_id);
  const [amount, setAmount] = useState(row.extracted_amount?.toString() ?? "");
  const [date, setDate] = useState(row.extracted_date ?? "");
  const m = useMutation({
    mutationFn: () => confirm({ data: { id: row.id, documentId: docId!, amount: Number(amount), paymentDate: date } }),
    onSuccess: () => {
      toast.success(t("finance:intakeInbox.payment.done"));
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">{t("finance:intakeInbox.payment.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("finance:intakeInbox.payment.hint")}</p>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("finance:intakeInbox.payment.none")}</p>
        ) : (
          <div className="space-y-1.5">
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => setDocId(c.id)}
                className={`w-full text-left rounded-md border p-2 text-sm ${docId === c.id ? "border-primary bg-accent" : "hover:bg-accent/50"}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="truncate">{c.supplier ?? "—"} · {c.document_number ?? "—"}</span>
                  <span className="tabular-nums">{fmt(c.open)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground flex gap-2">
                  <span>{c.issue_date ?? "—"}</span>
                  {c.due_date && <span>{t("finance:intakeInbox.payment.due")} {c.due_date}</span>}
                  {c.exact_amount && <Badge variant="secondary" className="text-[10px]">{t("finance:intakeInbox.payment.sameAmount")}</Badge>}
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">{t("finance:intakeInbox.payment.amount")}</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></div>
          <div><Label className="text-xs">{t("finance:intakeInbox.payment.date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <Button size="sm" disabled={!docId || !(Number(amount) > 0) || !date || m.isPending} onClick={() => m.mutate()}>
          {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          {t("finance:intakeInbox.payment.confirm")}
        </Button>
      </CardContent>
    </Card>
  );
}

function BankPanel({ row }: { row: InboxRow }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const file = useServerFn(fileBankDocument);
  const accountsQ = useQuery({
    queryKey: ["finance", "bank-accounts", "inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts").select("id, account_name, bank_name, iban, account_number").is("archived_at", null).order("account_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [accountId, setAccountId] = useState<string | null>(row.matched_bank_account_id);
  const [period, setPeriod] = useState(row.bank_period ?? "");
  const m = useMutation({
    mutationFn: () => file({ data: { id: row.id, bankAccountId: accountId!, period } }),
    onSuccess: (res) => {
      if (res.driveCopied) toast.success(t("finance:intakeInbox.bank.filedDrive"));
      else toast.warning(t("finance:intakeInbox.bank.filedNoDrive", { error: res.driveError ?? "" }));
      qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">{t("finance:intakeInbox.bank.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {row.matched_bank_account_id ? t("finance:intakeInbox.bank.matched") : t("finance:intakeInbox.bank.noMatch")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">{t("finance:intakeInbox.bank.account")}</Label>
            <Select value={accountId ?? ""} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder={t("finance:intakeInbox.bank.pickAccount")} /></SelectTrigger>
              <SelectContent>
                {(accountsQ.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{[a.bank_name, a.account_name].filter(Boolean).join(" · ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("finance:intakeInbox.bank.period")}</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("finance:intakeInbox.bank.importHint")}</p>
        <Button size="sm" disabled={!accountId || !/^\d{4}-\d{2}$/.test(period) || m.isPending} onClick={() => m.mutate()}>
          {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          {t("finance:intakeInbox.bank.file")}
        </Button>
      </CardContent>
    </Card>
  );
}

function OtherPanel({ row }: { row: InboxRow }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const mark = useServerFn(markOtherDocumentFiled);
  const m = useMutation({
    mutationFn: () => mark({ data: { id: row.id } }),
    onSuccess: () => { toast.success(t("finance:intakeInbox.other.done")); qc.invalidateQueries({ queryKey: ["finance", "review-queue"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <Card>
      <CardContent className="py-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("finance:intakeInbox.other.hint")}</p>
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>{t("finance:intakeInbox.other.markFiled")}</Button>
      </CardContent>
    </Card>
  );
}

/** Used by the bank-documents list to retry a failed Drive copy. */
export function useRetryDriveCopy() {
  return useServerFn(retryBankDriveCopy);
}
