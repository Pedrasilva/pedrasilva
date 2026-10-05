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
import { AlertTriangle, Check, ChevronDown, Clock, Loader2, RefreshCw, Settings } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IntakeUploadButton } from "@/components/finance/intake-upload-button";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SenderRulesPanel } from "@/components/finance/sender-rules-panel";
import { IntakeInstructionsPanel } from "@/components/finance/intake-instructions-panel";
import { Link } from "@tanstack/react-router";
import { Textarea } from "@/components/ui/textarea";
import { PdfCanvasPreview } from "@/components/finance/pdf-preview";
import { QueueItemCard, type QueueRow } from "@/components/finance/review-queue";
import {
  reclassifyQueueItem,
  confirmPaymentMatch,
  fileBankDocument,
  retryBankDriveCopy,
  markOtherDocumentFiled,
  resolvePossibleDuplicate,
  restoreDuplicate,
  saveExplanation,
  rereadItems,
  findRuleMatches,
} from "@/lib/finance/intake-inbox.functions";
import { RemoveButton, RemovedPanel } from "@/components/finance/intake-removal";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const TABS = ["triage", "purchases", "payments", "bank", "issued", "other", "ignored", "duplicates", "removed"] as const;
const MAIN_TABS = ["triage", "purchases", "payments", "bank", "issued", "other"] as const;
const MORE_TABS = ["ignored", "duplicates", "removed"] as const;
type Tab = (typeof TABS)[number];

export const INTAKE_TYPES = [
  "fatura_compra", "nota_credito", "recibo", "comprovativo_pagamento", "extrato_bancario",
  "nota_lancamento", "fatura_emitida", "documento_fiscal", "contrato_outro", "nao_financeiro", "desconhecido",
] as const;
type IntakeType = (typeof INTAKE_TYPES)[number];

const CHECKED = ["supplier_vat", "document_number", "issue_date", "amount_ex_vat", "vat_amount", "total_amount", "iban", "account_number", "recipient_vat"] as const;

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
  extracted_recipient_name: string | null;
  extracted_recipient_vat: string | null;
  other_entity_action: string | null;
  forwarded_to: string | null;
  forwarded_at: string | null;
  forward_error: string | null;
  sender_address: string | null;
  duplicate_of_id: string | null;
  duplicate_of_document_id: string | null;
  duplicate_kind: string | null;
  duplicate_reason: string | null;
  possible_duplicates: DupCand[] | null;
  possible_duplicate_resolved: boolean;
  applied_learning: {
    instructions?: Array<{ id: string; text: string; scope_type: string; scope_value: string | null }>;
    defaults?: { intake_type: string; classification_code: string; based_on: string[]; prefilled: boolean } | null;
    examples?: number; ai_type?: string | null; ai_code?: string | null;
  } | null;
  payment_match_candidates: Array<{
    id: string; document_number: string | null; issue_date: string | null; due_date: string | null;
    total: number; open: number; supplier: string | null; exact_amount: boolean;
  }> | null;
};

type DupCand = { reason: string; queueItemId?: string; documentId?: string; label: string; registeredAt: string };

function tabOf(r: InboxRow): Tab {
  if (String(r.status) === "duplicate") return "duplicates";
  if (String(r.status) === "removed") return "removed";
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
  const [tab, setTab] = useState<Tab | "rules" | "instructions">("triage");
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();

  const rowsQ = useQuery({
    queryKey: ["finance", "review-queue", "inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_document_review_queue")
        .select("*")
        // Filed / paid items stay visible in their tab with their status.
        .in("status", ["pending_review", "filed", "paid", "duplicate", "removed"])
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
    const m: Record<Tab, InboxRow[]> = { triage: [], purchases: [], payments: [], bank: [], issued: [], other: [], ignored: [], duplicates: [], removed: [] };
    for (const r of rowsQ.data ?? []) m[tabOf(r)].push(r);
    return m;
  }, [rowsQ.data]);

  const switchTab = (v: Tab | "rules" | "instructions") => { setTab(v); setSelected(null); setRuleId(null); };
  const countOf = (k: Tab) => (k === "duplicates" || k === "removed" ? byTab[k].length : byTab[k].filter((r) => r.status === "pending_review").length);
  const list = tab === "rules" || tab === "instructions" ? [] : byTab[tab];
  const openItem = (id: string) => {
    const rows = qc.getQueryData<InboxRow[]>(["finance", "review-queue", "inbox"]) ?? rowsQ.data ?? [];
    const r = rows.find((x) => x.id === id);
    if (r) { setTab(tabOf(r)); setSelected(id); }
  };
  const openRule = (id: string) => { setRuleId(id); setTab("instructions"); };
  const active = list.find((r) => r.id === selected) ?? list[0] ?? null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("finance:intakeInbox.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("finance:intakeInbox.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["finance", "review-queue"] })}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            {t("common:actions.refresh", { defaultValue: "Refresh" })}
          </Button>
          <IntakeUploadButton />
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => switchTab(v as Tab | "rules" | "instructions")}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList className="flex-wrap h-auto">
            {MAIN_TABS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {t(`finance:intakeInbox.tabs.${k}`)}
                <Badge variant="secondary" className="ml-1.5 text-[10px]">{countOf(k)}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant={(MORE_TABS as readonly string[]).includes(tab) ? "default" : "outline"}>
                {(MORE_TABS as readonly string[]).includes(tab) ? t(`finance:intakeInbox.tabs.${tab}`) : t("finance:intakeInbox.tabs.more")}
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {MORE_TABS.map((k) => (
                <DropdownMenuItem key={k} onClick={() => switchTab(k)} className="justify-between gap-4">
                  {t(`finance:intakeInbox.tabs.${k}`)}
                  <Badge variant="secondary" className="text-[10px]">{countOf(k)}</Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant={tab === "rules" || tab === "instructions" ? "default" : "outline"} aria-label={t("finance:intakeInbox.tabs.settings")} title={t("finance:intakeInbox.tabs.settings")}>
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => switchTab("instructions")}>{t("finance:intakeInbox.tabs.instructions")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchTab("rules")}>{t("finance:intakeInbox.tabs.rules")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Tabs>

      {tab === "instructions" ? <IntakeInstructionsPanel highlightId={ruleId} /> : tab === "rules" ? <SenderRulesPanel /> : (
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
              onOpenItem={openItem}
              onOpenRule={openRule}
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
      )}
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
      {row.possible_duplicates?.length && !row.possible_duplicate_resolved && status === "pending_review" ? (
        <Badge variant="destructive" className="text-[10px]">{t("finance:intakeInbox.dup.possibleBadge")}</Badge>
      ) : null}
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
  row, tab, isPt, classifications, suppliers, projects, onOpenItem, onOpenRule,
}: {
  onOpenItem: (id: string) => void;
  onOpenRule: (id: string) => void;
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
  if (String(row.status) === "removed") {
    return (
      <>
        <Card><CardHeader className="py-3 flex flex-row items-center gap-2 flex-wrap"><TypeBadge row={row} /></CardHeader></Card>
        <RemovedPanel row={row} />
        <DocPreview row={row} />
      </>
    );
  }
  if (String(row.status) === "duplicate") {
    return (
      <>
        <Card><CardHeader className="py-3 flex flex-row items-center gap-2 flex-wrap"><TypeBadge row={row} /><StatusBadges row={row} /></CardHeader></Card>
        <DuplicatePanel row={row} onOpenItem={onOpenItem} />
        <DocPreview row={row} />
      </>
    );
  }

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
            <RemoveButton row={row} onOpenRule={onOpenRule} />
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

      <DuplicatePanel row={row} onOpenItem={onOpenItem} />
      <LearningPanel row={row} onOpenRule={onOpenRule} onOpenItem={onOpenItem} />

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
          {row.status === "filed" && tab === "bank" && <DriveCopyLine row={row} />}
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

function DriveCopyLine({ row }: { row: InboxRow }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const retry = useServerFn(retryBankDriveCopy);
  const r = row as InboxRow & { drive_copy_status: string | null; drive_web_link: string | null; drive_copy_error: string | null; drive_next_retry_at: string | null };
  const m = useMutation({
    mutationFn: () => retry({ data: { id: row.id } }),
    onSuccess: (res) => { res.ok ? toast.success(t("finance:driveArchive.copiedToast")) : toast.error(res.driveError ?? t("finance:driveArchive.status.failed")); qc.invalidateQueries({ queryKey: ["finance", "review-queue"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const status = r.drive_copy_status ?? "pending";
  return (
    <Card>
      <CardContent className="py-3 flex items-center justify-between gap-3 text-sm flex-wrap">
        <span>
          Drive: <span className={status === "failed" ? "text-destructive font-medium" : "font-medium"}>{t(`finance:driveArchive.status.${status}`)}</span>
          {status === "copied" && r.drive_web_link && <> (<a className="underline" href={r.drive_web_link} target="_blank" rel="noreferrer">{t("finance:driveArchive.open")}</a>)</>}
          {status === "failed" && r.drive_next_retry_at && <span className="text-xs text-muted-foreground"> · {t("finance:driveArchive.nextRetry", { date: new Date(r.drive_next_retry_at).toLocaleString() })}</span>}
        </span>
        {status !== "copied" && (
          <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{t("finance:driveArchive.retry")}
          </Button>
        )}
        {status === "failed" && r.drive_copy_error && <p className="w-full text-xs text-muted-foreground break-all">{r.drive_copy_error.slice(0, 300)}</p>}
      </CardContent>
    </Card>
  );
}

/** Used by the bank-documents list to retry a failed Drive copy. */
export function useRetryDriveCopy() {
  return useServerFn(retryBankDriveCopy);
}

function DupLink({ c, onOpenItem }: { c: { queueItemId?: string | null; documentId?: string | null; label: string; registeredAt?: string | null }; onOpenItem: (id: string) => void }) {
  const { t, i18n } = useTranslation(["finance"]);
  const date = c.registeredAt ? new Date(c.registeredAt).toLocaleDateString(i18n.language) : "—";
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="truncate">{c.label} · <span className="text-muted-foreground">{t("finance:intakeInbox.dup.registeredAt", { date })}</span></span>
      {c.documentId ? (
        <Button asChild size="sm" variant="outline"><Link to="/finance/documents/$documentId" params={{ documentId: c.documentId }}>{t("finance:intakeInbox.dup.open")}</Link></Button>
      ) : c.queueItemId ? (
        <Button size="sm" variant="outline" onClick={() => onOpenItem(c.queueItemId!)}>{t("finance:intakeInbox.dup.open")}</Button>
      ) : null}
    </div>
  );
}

function DuplicatePanel({ row, onOpenItem }: { row: InboxRow; onOpenItem: (id: string) => void }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const resolve = useServerFn(resolvePossibleDuplicate);
  const restore = useServerFn(restoreDuplicate);
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ["finance", "review-queue"] }); };
  const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
  const resolveM = useMutation({
    mutationFn: (v: { decision: "duplicate" | "not_duplicate"; otherId?: string }) => resolve({ data: { id: row.id, ...v } }),
    onSuccess: (_r, v) => done(v.decision === "duplicate" ? t("finance:intakeInbox.dup.marked") : t("finance:intakeInbox.dup.kept")),
    onError: onErr,
  });
  const restoreM = useMutation({ mutationFn: () => restore({ data: { id: row.id } }), onSuccess: () => done(t("finance:intakeInbox.dup.restored")), onError: onErr });

  if (String(row.status) === "duplicate") {
    const label = row.duplicate_of_document_id ? t("finance:intakeInbox.dup.liveDocument") : (row.original_filename ?? "—");
    return (
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">{t("finance:intakeInbox.dup.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {row.duplicate_reason && <p className="text-xs text-muted-foreground">{t(`finance:intakeInbox.dup.reasons.${row.duplicate_reason}`, { defaultValue: row.duplicate_reason })}</p>}
          <p className="text-xs font-medium">{t("finance:intakeInbox.dup.of")}</p>
          <DupLink c={{ queueItemId: row.duplicate_of_id, documentId: row.duplicate_of_document_id, label }} onOpenItem={onOpenItem} />
          <p className="text-[11px] text-muted-foreground">{t("finance:intakeInbox.dup.nothingCreated")}</p>
          <Button size="sm" variant="outline" disabled={restoreM.isPending} onClick={() => restoreM.mutate()}>{t("finance:intakeInbox.dup.notDuplicate")}</Button>
        </CardContent>
      </Card>
    );
  }
  const cands = row.possible_duplicates ?? [];
  if (!cands.length || row.possible_duplicate_resolved || row.status !== "pending_review") return null;
  return (
    <Card className="border-destructive">
      <CardHeader className="py-3"><CardTitle className="text-sm">{t("finance:intakeInbox.dup.possibleTitle")}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("finance:intakeInbox.dup.possibleHint")}</p>
        {cands.map((c) => (
          <div key={c.queueItemId ?? c.documentId} className="rounded-md border p-2 space-y-1.5">
            <p className="text-[11px] text-muted-foreground">{t(`finance:intakeInbox.dup.reasons.${c.reason}`, { defaultValue: c.reason })}</p>
            <DupLink c={c} onOpenItem={onOpenItem} />
            <Button size="sm" variant="destructive" disabled={resolveM.isPending}
              onClick={() => resolveM.mutate({ decision: "duplicate", otherId: c.queueItemId ?? c.documentId })}>
              {t("finance:intakeInbox.dup.isDuplicate")}
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" disabled={resolveM.isPending} onClick={() => resolveM.mutate({ decision: "not_duplicate" })}>
          {t("finance:intakeInbox.dup.notDuplicate")}
        </Button>
      </CardContent>
    </Card>
  );
}

type Scope = "document" | "recipient" | "supplier" | "sender" | "global";
type Summary = { id: string; status: string; intake_type: string | null; intake_route: string | null; title: string; date: string | null; manualType?: boolean };

function LearningPanel({ row, onOpenRule, onOpenItem }: { row: InboxRow; onOpenRule: (id: string) => void; onOpenItem: (id: string) => void }) {
  const { t } = useTranslation(["finance"]);
  const k = (x: string, o?: Record<string, unknown>) => t(`finance:intakeInbox.learn.${x}`, o);
  const qc = useQueryClient();
  const save = useServerFn(saveExplanation);
  const reread = useServerFn(rereadItems);
  const findMatches = useServerFn(findRuleMatches);
  const [note, setNote] = useState((row as { review_note?: string | null }).review_note ?? "");
  const [scope, setScope] = useState<Scope>("document");
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<{ id: string; text: string; scope: Scope; label: string } | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [rereadError, setRereadError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Summary[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  const l = row.applied_learning;
  const typeLabel = (v?: string | null) => (v ? t(`finance:intakeInbox.types.${v}`, { defaultValue: v }) : "—");
  const tabLabel = (r?: string | null, status?: string) =>
    status === "duplicate" ? t("finance:intakeInbox.tabs.duplicates")
    : t(`finance:intakeInbox.tabs.${!r || r === "retry" ? "triage" : r}`, { defaultValue: r ?? "" });

  const recName = row.extracted_recipient_name ?? row.extracted_buyer_name;
  const recNif = row.extracted_recipient_vat ?? row.extracted_buyer_vat;
  const supName = row.extracted_supplier_name ?? row.extracted_seller_name;
  const supNif = row.extracted_supplier_vat ?? row.extracted_seller_vat;
  const sender = row.sender_address;
  const who = (name?: string | null, nif?: string | null) => [name, nif ? `(${nif})` : null].filter(Boolean).join(" ");
  const options: Array<{ v: Scope; label: string; disabled: boolean }> = [
    { v: "document", label: k("scope.document"), disabled: false },
    { v: "recipient", label: recNif ? k("scope.recipient", { who: who(recName, recNif) }) : k("scope.recipientNone"), disabled: !recNif },
    { v: "supplier", label: supNif ? k("scope.supplier", { who: who(supName, supNif) }) : k("scope.supplierNone"), disabled: !supNif },
    { v: "sender", label: sender ? k("scope.sender", { who: sender }) : k("scope.senderNone"), disabled: !sender },
    { v: "global", label: k("scope.global"), disabled: false },
  ];
  const chosen = options.find((o) => o.v === scope)!;

  const refresh = async () => {
    await qc.refetchQueries({ queryKey: ["finance", "review-queue", "inbox"] });
  };

  const m = useMutation({
    mutationFn: async () => {
      const r = await save({ data: { id: row.id, note: note.trim(), scope } });
      setSaved({ id: r.instruction.id, text: r.instruction.text, scope, label: chosen.label });
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["finance", "intake-instructions"] });
      // Re-read THIS document with the new rule.
      if (row.status === "pending_review") {
        const rr = await reread({ data: { ids: [row.id] } });
        setRereadError(rr.errors[0]?.error ?? null);
        setResult(rr.items[0] ?? null);
      }
      if (scope !== "document") {
        const fm = await findMatches({ data: { instructionId: r.instruction.id, excludeId: row.id } });
        setMatches(fm.items);
      } else setMatches([]);
      await refresh();
      onOpenItem(row.id);
    },
    onSuccess: () => toast.success(k("savedRule")),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const applyM = useMutation({
    mutationFn: async () => {
      const ids = (matches ?? []).map((x) => x.id);
      let failed = 0;
      setProgress({ done: 0, total: ids.length, failed: 0 });
      for (let i = 0; i < ids.length; i += 3) {
        const r = await reread({ data: { ids: ids.slice(i, i + 3) } });
        failed += r.errors.length;
        setProgress({ done: Math.min(i + 3, ids.length), total: ids.length, failed });
      }
      await refresh();
      return { total: ids.length, failed };
    },
    onSuccess: (r) => { toast.success(k("appliedSimilar", { count: r.total - r.failed })); setShowPreview(false); setMatches([]); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const predicted = scope === "recipient" || scope === "supplier" ? result?.intake_type ?? null : null;

  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">{t("finance:intakeInbox.learn.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {(l?.instructions ?? []).map((i) => (
          <div key={i.id} className="flex items-start justify-between gap-2 text-sm">
            <div><Badge variant="secondary" className="text-[10px] mr-1.5">{k("instruction")}</Badge>{i.text}</div>
            <Button size="sm" variant="ghost" onClick={() => onOpenRule(i.id)}>{k("editRule")}</Button>
          </div>
        ))}
        {l?.defaults && (
          <div className="text-sm">
            <Badge variant="secondary" className="text-[10px] mr-1.5">{k("default")}</Badge>
            {k("defaultText", { type: typeLabel(l.defaults.intake_type), code: l.defaults.classification_code, n: l.defaults.based_on.length })}
          </div>
        )}
        {(l?.instructions?.length || l?.defaults) && (l?.ai_type || l?.ai_code) ? (
          <p className="text-[11px] text-muted-foreground">{k("aiSaid", { type: typeLabel(l?.ai_type), code: l?.ai_code ?? "—" })}</p>
        ) : null}
        {l?.examples ? <p className="text-xs text-muted-foreground">{k("examples", { count: l.examples })}</p> : null}

        <div className="space-y-2">
          <Label className="text-xs">{k("explain")}</Label>
          <Textarea rows={2} maxLength={1000} value={note} onChange={(e) => { setNote(e.target.value); setConfirming(false); }} placeholder={k("explainPlaceholder")} />
          <Label className="text-xs">{k("scopeTitle")}</Label>
          <RadioGroup value={scope} onValueChange={(v) => { setScope(v as Scope); setConfirming(false); }} className="gap-1.5">
            {options.map((o) => (
              <label key={o.v} className={`flex items-start gap-2 text-xs ${o.disabled ? "opacity-50" : "cursor-pointer"}`}>
                <RadioGroupItem value={o.v} disabled={o.disabled} className="mt-0.5" />
                <span>{o.label}</span>
              </label>
            ))}
          </RadioGroup>
          {!confirming ? (
            <Button size="sm" variant="outline" disabled={!note.trim() || m.isPending} onClick={() => setConfirming(true)}>{k("save")}</Button>
          ) : (
            <div className="rounded-md border p-2.5 space-y-2 bg-muted/30">
              <p className="text-xs">{k("confirmText")}</p>
              <p className="text-sm">“{note.trim()}”</p>
              <p className="text-xs text-muted-foreground">{chosen.label}</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
                  {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  {m.isPending ? k("rereading") : k("confirm")}
                </Button>
                <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => setConfirming(false)}>{k("cancel")}</Button>
              </div>
            </div>
          )}
        </div>

        {saved && (
          <div className="rounded-md border p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm">
                <Badge variant="secondary" className="text-[10px] mr-1.5">{k("savedTitle")}</Badge>“{saved.text}”
                <div className="text-xs text-muted-foreground mt-0.5">{saved.label}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onOpenRule(saved.id)}>{k("viewRule")}</Button>
            </div>
            {result && (
              <p className="text-xs">
                {k("rereadResult", { type: typeLabel(result.intake_type), tab: tabLabel(result.intake_route, result.status) })}
              </p>
            )}
            {rereadError && <p className="text-xs text-destructive">{k("rereadFailed")}: {rereadError}</p>}
            {matches && matches.length > 0 && !progress && (
              <div className="space-y-2">
                {!showPreview ? (
                  <Button size="sm" variant="outline" onClick={() => setShowPreview(true)}>{k("applySimilar", { count: matches.length })}</Button>
                ) : (
                  <>
                    <div className="max-h-[260px] overflow-auto rounded-md border divide-y">
                      {matches.map((x) => (
                        <div key={x.id} className="grid grid-cols-[1fr_auto] gap-2 px-2 py-1.5 text-xs">
                          <span className="truncate">{x.title} <span className="text-muted-foreground">· {x.date ?? "—"}</span></span>
                          <span className="text-muted-foreground">
                            {typeLabel(x.intake_type)} → {x.manualType ? k("keepsManual") : predicted ? typeLabel(predicted) : k("toBeRead")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => applyM.mutate()} disabled={applyM.isPending}>{k("applyConfirm", { count: matches.length })}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowPreview(false)}>{k("cancel")}</Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {matches && matches.length === 0 && scope !== "document" && !progress && <p className="text-xs text-muted-foreground">{k("noSimilar")}</p>}
            {progress && (
              <p className="text-xs text-muted-foreground">
                {applyM.isPending && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
                {k("progress", { done: progress.done, total: progress.total, failed: progress.failed })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
