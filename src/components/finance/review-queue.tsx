/**
 * D3 — Financial document review queue.
 *
 * Manual upload → AI extraction → supplier match (VAT only) → suggested
 * classification. Every item waits here for a human. Two independent
 * checkpoints ("Approve supplier" / "Approve classification"); only when BOTH
 * are approved is a real expense document written.
 *
 * Documents that share an invoice number are grouped (invoice + its receipt =
 * one transaction) and reviewed as a single unit.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Check,
  X,
  RefreshCw,
  Repeat,
  AlertTriangle,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  HelpCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClassificationPicker } from "@/components/finance/classification-picker";
import { PdfCanvasPreview } from "@/components/finance/pdf-preview";
import {
  ingestFinancialDocument,
  approveQueueSupplier,
  approveQueueClient,
  approveQueueClassification,
  finalizeQueueItem,
  rejectQueueItem,
  reprocessQueueItemFn,
} from "@/lib/finance/doc-intake.functions";


type QueueRow = {
  id: string;
  source_file_url: string;
  source_bucket: string;
  original_filename: string | null;
  source: string;
  doc_type: string;
  doc_type_confidence: number | null;
  direction: "issued" | "received" | "unclear";
  extraction_error: string | null;
  extracted_amount: number | null;
  extracted_vat_amount: number | null;
  extracted_date: string | null;
  extracted_due_date: string | null;
  extracted_currency: string | null;
  extracted_document_number: string | null;
  extracted_supplier_name: string | null;
  extracted_supplier_vat: string | null;
  extracted_seller_name: string | null;
  extracted_seller_vat: string | null;
  extracted_buyer_name: string | null;
  extracted_buyer_vat: string | null;
  buyer_vat_is_own: boolean | null;
  extracted_payment_method: string | null;
  extracted_card_last4: string | null;
  paid_from_account_id?: string | null;
  extracted_balance_due: number | null;
  payment_status: "paid_at_source" | "awaiting_payment" | "reconciled";

  supplier_match_status: string;
  matched_supplier_id: string | null;
  ambiguous_supplier_ids: string[];
  client_match_status: string;
  matched_client_id: string | null;
  ambiguous_client_ids: string[];
  suggested_classification_id: string | null;
  suggested_classification_code: string | null;
  classification_confidence: number | null;
  is_recurring_candidate: boolean;
  linked_document_group_id: string;
  status: string;
  supplier_approved_at: string | null;
  classification_approved_at: string | null;
  created_expense_id: string | null;
  created_project_id: string | null;
  rejection_reason: string | null;
  created_at: string;
};

const BUCKET = "financial-documents";

function fmtMoney(v: number | null, cur: string | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: cur || "EUR",
  }).format(v);
}

/**
 * The other party on the document: the client for documents the firm issued,
 * the supplier for documents it received.
 */
function counterpartyName(row: QueueRow): string | null {
  if (row.direction === "issued") return row.extracted_buyer_name ?? null;
  return row.extracted_supplier_name ?? row.extracted_seller_name ?? null;
}

function counterpartyVat(row: QueueRow): string | null {
  if (row.direction === "issued") return row.extracted_buyer_vat ?? null;
  return row.extracted_supplier_vat ?? row.extracted_seller_vat ?? null;
}

function DirectionBadge({ direction }: { direction: QueueRow["direction"] }) {
  const { t } = useTranslation(["finance"]);
  const variant =
    direction === "issued" ? "default" : direction === "unclear" ? "destructive" : "secondary";
  const Icon =
    direction === "issued" ? ArrowUpRight : direction === "unclear" ? HelpCircle : ArrowDownLeft;
  return (
    <Badge variant={variant} className="text-[10px]">
      <Icon className="h-3 w-3 mr-1" />
      {t(`finance:reviewQueue.direction.${direction}`)}
    </Badge>
  );
}

/**
 * Payment status is about the MONEY (paid at source / awaiting payment /
 * reconciled) — distinct from the direction badge, which is about ingestion.
 */
function PaymentStatusBadge({ status }: { status: QueueRow["payment_status"] }) {
  const { t } = useTranslation(["finance"]);
  const s = status ?? "awaiting_payment";
  const variant = s === "reconciled" ? "default" : s === "paid_at_source" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="text-[10px]">
      {t(`finance:reviewQueue.paymentStatus.${s}`, { defaultValue: s })}
    </Badge>
  );
}

/** Informational only — never changes classification or approval. */
function OwnVatBadge() {
  const { t } = useTranslation(["finance"]);
  return (
    <Badge variant="outline" className="text-[10px]" title={t("finance:reviewQueue.billedToOwnVatHint")}>
      {t("finance:reviewQueue.billedToOwnVat")}
    </Badge>
  );
}



/**
 * One pipeline, two presentations:
 * - `side="received"` (Payments) shows payables plus every still-`unclear`
 *   document, since those belong to neither side until confirmed.
 * - `side="issued"` (Invoicing) shows only receivables.
 */
export function ReviewQueue({ side = "received" }: { side?: "received" | "issued" } = {}) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const isPt = i18n.language?.startsWith("pt");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [uploading, setUploading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const ingest = useServerFn(ingestFinancialDocument);

  const queueQ = useQuery({
    queryKey: ["finance", "review-queue", statusFilter, side],
    queryFn: async () => {
      let q = supabase
        .from("financial_document_review_queue")
        .select("*")
        .eq("status", statusFilter as "pending_review" | "approved" | "rejected");
      q =
        side === "issued"
          ? q.eq("direction", "issued")
          : q.in("direction", ["received", "unclear"]);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
  });


  const classificationsQ = useQuery({
    queryKey: ["finance", "classifications", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_classifications")
        .select("id, code, name_pt, name_en")
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const suppliersQ = useQuery({
    queryKey: ["finance", "suppliers", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome, nif, is_supplier")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const projectsQ = useQuery({
    queryKey: ["finance", "projects", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_projects")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const groups = useMemo(() => {
    const rows = queueQ.data ?? [];
    const map = new Map<string, QueueRow[]>();
    for (const r of rows) {
      const list = map.get(r.linked_document_group_id) ?? [];
      list.push(r);
      map.set(r.linked_document_group_id, list);
    }
    return [...map.entries()].map(([gid, items]) => ({ gid, items }));
  }, [queueQ.data]);

  const activeGroup =
    groups.find((g) => g.gid === selectedGroup) ?? groups[0] ?? null;

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `intake/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw new Error(upErr.message);
        const res = await ingest({
          data: {
            storagePath: path,
            bucket: BUCKET,
            originalFilename: file.name,
            source: "manual_upload",
          },
        });
        if (!res.ok) toast.error(`${file.name}: ${res.error ?? "extraction failed"}`);
      }
      toast.success(t("finance:reviewQueue.uploadDone"));
      qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t(side === "issued" ? "finance:reviewQueue.titleIssued" : "finance:reviewQueue.titleReceived")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(side === "issued" ? "finance:reviewQueue.subtitleIssued" : "finance:reviewQueue.subtitleReceived")}
          </p>

        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["finance", "review-queue"] })}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            {t("common:actions.refresh", { defaultValue: "Refresh" })}
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1.5" />
            )}
            {t("finance:reviewQueue.upload")}
          </Button>
        </div>
      </header>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="pending_review">{t("finance:reviewQueue.pending")}</TabsTrigger>
          <TabsTrigger value="approved">{t("finance:reviewQueue.approved")}</TabsTrigger>
          <TabsTrigger value="rejected">{t("finance:reviewQueue.rejected")}</TabsTrigger>
          <TabsTrigger value="ignored">{t("finance:reviewQueue.ignored")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {statusFilter === "ignored" ? (
        <IgnoredEmailItems />
      ) : (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              {t("finance:reviewQueue.itemsCount", { count: groups.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[640px] overflow-auto">
            {queueQ.isLoading && (
              <p className="text-sm text-muted-foreground">{t("finance:reviewQueue.loading")}</p>
            )}
            {!queueQ.isLoading && groups.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("finance:reviewQueue.empty")}</p>
            )}
            {groups.map(({ gid, items }) => {
              const head = items[0];
              return (
                <button
                  key={gid}
                  onClick={() => setSelectedGroup(gid)}
                  className={`w-full text-left rounded-md border p-2.5 text-sm transition-colors ${
                    activeGroup?.gid === gid ? "border-primary bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {counterpartyName(head) ?? head.original_filename ?? t("finance:reviewQueue.unknownSupplier")}
                    </span>
                    <span className="text-xs tabular-nums">
                      {fmtMoney(head.extracted_amount, head.extracted_currency)}
                    </span>
                  </div>
                  {head.direction === "unclear" && head.doc_type !== "bank_statement" && (
                    <p className="mt-1 text-[11px] text-destructive">
                      {t("finance:reviewQueue.unclearHint")}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {head.doc_type !== "bank_statement" && (
                      <DirectionBadge direction={head.direction} />
                    )}
                    {head.doc_type !== "bank_statement" && (
                      <PaymentStatusBadge status={head.payment_status} />
                    )}
                    {head.buyer_vat_is_own && <OwnVatBadge />}



                    {items.length > 1 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t("finance:reviewQueue.groupedDocs", { count: items.length })}
                      </Badge>
                    )}
                    {head.is_recurring_candidate && (
                      <Badge variant="outline" className="text-[10px]">
                        <Repeat className="h-3 w-3 mr-1" />
                        {t("finance:reviewQueue.recurring")}
                      </Badge>
                    )}
                    {head.extraction_error && (
                      <Badge variant="destructive" className="text-[10px]">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {t("finance:reviewQueue.extractionFailed")}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {head.extracted_date ?? "—"}
                    </span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {activeGroup ? (
            activeGroup.items.map((row) => (
              <QueueItemCard
                key={row.id}
                row={row}
                isPt={!!isPt}
                classifications={classificationsQ.data ?? []}
                suppliers={suppliersQ.data ?? []}
                projects={projectsQ.data ?? []}
              />
            ))
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("finance:reviewQueue.selectItem")}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function IgnoredEmailItems() {
  const { t } = useTranslation(["finance"]);
  const q = useQuery({
    queryKey: ["finance", "email-ignored"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_email_ignored_items")
        .select("id, message_id, from_address, subject, attachment_filename, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">{t("finance:reviewQueue.ignoredTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {(q.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">{t("finance:reviewQueue.empty")}</p>
        )}
        {(q.data ?? []).map((r) => (
          <div key={r.id} className="rounded-md border p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{r.subject ?? r.message_id}</span>
              <Badge variant="outline" className="text-[10px]">{r.reason}</Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {r.from_address ?? "—"}
              {r.attachment_filename ? ` · ${r.attachment_filename}` : ""}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function QueueItemCard({
  row,
  isPt,
  classifications,
  suppliers,
  projects,
}: {
  row: QueueRow;
  isPt: boolean;
  classifications: Array<{ id: string; code: string; name_pt: string; name_en: string }>;
  suppliers: Array<{ id: string; nome: string; nif: string | null; is_supplier: boolean }>;
  projects: Array<{ id: string; name: string }>;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();

  const isIssued = row.direction === "issued";
  const isUnclear = row.direction === "unclear";

  const [fields, setFields] = useState({
    supplier_name: counterpartyName(row) ?? "",
    supplier_vat: counterpartyVat(row) ?? "",
    document_number: row.extracted_document_number ?? "",
    date: row.extracted_date ?? "",
    amount: row.extracted_amount?.toString() ?? "",
    vat: row.extracted_vat_amount?.toString() ?? "",
    currency: row.extracted_currency ?? "EUR",
    payment_method: row.extracted_payment_method ?? "",
    card_last4: row.extracted_card_last4 ?? "",

  });
  const [counterpartyId, setCounterpartyId] = useState<string | null>(
    isIssued ? row.matched_client_id : row.matched_supplier_id,
  );
  const supplierId = counterpartyId;
  const setSupplierId = setCounterpartyId;
  const [classificationId, setClassificationId] = useState<string | null>(
    row.suggested_classification_id,
  );
  const [projectId, setProjectId] = useState<string | null>(row.created_project_id);
  const [assignedCollaboratorId, setAssignedCollaboratorId] = useState<string | null>(
    (row as { assigned_collaborator_id?: string | null }).assigned_collaborator_id ?? null,
  );
  // Which bank account / card actually settled the document. Only relevant
  // for card, transfer and direct-debit payments.
  const [paidFromAccountId, setPaidFromAccountId] = useState<string | null>(
    row.paid_from_account_id ?? null,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Staff benefits (BEN.*) must be attributed to a person before approval.
  const selectedCode = classifications.find((c) => c.id === classificationId)?.code ?? null;
  const isBenefit = !!selectedCode && (selectedCode === "BEN" || selectedCode.startsWith("BEN."));
  const collaboratorsQ = useQuery({
    queryKey: ["collaborators-picker", "benefit-assign"],
    enabled: isBenefit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, nome")
        .is("archived_at", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });


  const approveSupplier = useServerFn(approveQueueSupplier);
  const approveClient = useServerFn(approveQueueClient);
  const approveClassification = useServerFn(approveQueueClassification);
  const finalize = useServerFn(finalizeQueueItem);
  const reject = useServerFn(rejectQueueItem);
  const reprocess = useServerFn(reprocessQueueItemFn);


  const invalidate = () => qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });

  // Chrome refuses to render cross-origin PDFs inside the nested preview
  // iframe, so we download the file and hand the viewer a same-origin blob URL.
  useQuery({
    queryKey: ["finance", "review-queue", "preview", row.id],
    queryFn: async () => {
      const bucket = row.source_bucket || BUCKET;
      const { data: blob } = await supabase.storage.from(bucket).download(row.source_file_url);
      if (blob) {
        const typed =
          blob.type && blob.type !== "application/octet-stream"
            ? blob
            : new Blob([blob], {
                type: row.source_file_url.toLowerCase().endsWith(".pdf")
                  ? "application/pdf"
                  : "image/jpeg",
              });
        const url = URL.createObjectURL(typed);
        setPreviewUrl(url);
        return url;
      }
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.source_file_url, 3600);
      setPreviewUrl(data?.signedUrl ?? null);
      return data?.signedUrl ?? null;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);


  const saveFields = useMutation({
    mutationFn: async () => {
      // Counterparty edits land on the buyer fields for issued documents and
      // on the supplier fields for received ones — never both.
      const party = isIssued
        ? {
            extracted_buyer_name: fields.supplier_name || null,
            extracted_buyer_vat: fields.supplier_vat || null,
          }
        : {
            extracted_supplier_name: fields.supplier_name || null,
            extracted_supplier_vat: fields.supplier_vat || null,
            extracted_seller_name: fields.supplier_name || null,
            extracted_seller_vat: fields.supplier_vat || null,
          };
      const { error } = await supabase
        .from("financial_document_review_queue")
        .update({
          ...party,
          extracted_document_number: fields.document_number || null,
          extracted_date: fields.date || null,
          extracted_amount: fields.amount ? Number(fields.amount) : null,
          extracted_vat_amount: fields.vat ? Number(fields.vat) : null,
          extracted_currency: fields.currency || "EUR",
          extracted_payment_method: fields.payment_method || null,
          extracted_card_last4: fields.card_last4.replace(/\D/g, "").slice(-4) || null,

        })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("finance:reviewQueue.saved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Reviewer override when the AI could not anchor the firm's own VAT. */
  const setDirection = useMutation({
    mutationFn: async (direction: "issued" | "received") => {
      const { error } = await supabase
        .from("financial_document_review_queue")
        .update({ direction })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(t("finance:reviewQueue.saved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doApproveSupplier = useMutation({
    mutationFn: async () => {
      if (isIssued) {
        if (counterpartyId) {
          await approveClient({ data: { id: row.id, clientId: counterpartyId } });
        } else {
          await approveClient({
            data: {
              id: row.id,
              newClient: {
                nome: fields.supplier_name || t("finance:reviewQueue.unknownClient"),
                nif: fields.supplier_vat || null,
              },
            },
          });
        }
        return;
      }
      if (supplierId) {
        await approveSupplier({ data: { id: row.id, supplierId } });
      } else {
        await approveSupplier({
          data: {
            id: row.id,
            newSupplier: {
              nome: fields.supplier_name || t("finance:reviewQueue.unknownSupplier"),
              nif: fields.supplier_vat || null,
            },
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(
        isIssued
          ? t("finance:reviewQueue.clientApproved")
          : t("finance:reviewQueue.supplierApproved"),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doApproveClassification = useMutation({
    mutationFn: async () => {
      if (!classificationId) throw new Error(t("finance:reviewQueue.pickClassification"));
      if (isBenefit && !assignedCollaboratorId)
        throw new Error(t("finance:reviewQueue.pickCollaborator"));
      await approveClassification({
        data: {
          id: row.id,
          classificationId,
          projectId: projectId ?? null,
          assignedCollaboratorId: isBenefit ? assignedCollaboratorId : null,
        },
      });
    },

    onSuccess: () => {
      toast.success(t("finance:reviewQueue.classificationApproved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doFinalize = useMutation({
    mutationFn: async () => finalize({ data: { id: row.id } }),
    onSuccess: () => {
      toast.success(t("finance:reviewQueue.finalized"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doReject = useMutation({
    mutationFn: async () => reject({ data: { id: row.id, reason: rejectReason || null } }),
    onSuccess: () => {
      toast.success(t("finance:reviewQueue.rejected"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doReprocess = useMutation({
    mutationFn: async () => {
      const res = await reprocess({ data: { id: row.id } });
      if (!res.ok) throw new Error(res.error ?? "reprocess failed");
      return res;
    },
    onSuccess: () => {
      toast.success(t("finance:reviewQueue.reextracted"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bothApproved = !!row.supplier_approved_at && !!row.classification_approved_at;
  const readOnly = row.status !== "pending_review";
  const isBankStatement = row.doc_type === "bank_statement";
  const isPdf =
    (row.original_filename ?? row.source_file_url).toLowerCase().endsWith(".pdf");

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {row.original_filename ?? row.source_file_url.split("/").pop()}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {!isBankStatement && <DirectionBadge direction={row.direction} />}
            {!isBankStatement && <PaymentStatusBadge status={row.payment_status} />}
            {row.buyer_vat_is_own && <OwnVatBadge />}

            <Badge variant="outline" className="text-[10px] capitalize">
              {t(`finance:reviewQueue.docType.${row.doc_type}`, { defaultValue: row.doc_type })}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {t(`finance:reviewQueue.sourceLabel.${row.source}`, { defaultValue: row.source })}
            </Badge>
            {row.is_recurring_candidate && (
              <Badge variant="outline" className="text-[10px]">
                <Repeat className="h-3 w-3 mr-1" />
                {t("finance:reviewQueue.recurring")}
              </Badge>
            )}
            {!readOnly && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                disabled={doReprocess.isPending}
                onClick={() => doReprocess.mutate()}
              >
                {doReprocess.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">{t("finance:reviewQueue.reextract")}</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {row.extraction_error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
            {row.extraction_error}
          </div>
        )}

        {isBankStatement && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
            <p className="font-medium">{t("finance:reviewQueue.bankStatement.title")}</p>
            <p className="text-muted-foreground">{t("finance:reviewQueue.bankStatement.hint")}</p>
            <Link to="/finance/banking/reconciliation" className="underline font-medium">
              {t("finance:reviewQueue.bankStatement.cta")}
            </Link>
          </div>
        )}

        {!isBankStatement && (
          <div
            className={`rounded-md border p-3 text-xs space-y-2 ${
              isUnclear ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"
            }`}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("finance:reviewQueue.parties.seller")}
                </p>
                <p className="font-medium">{row.extracted_seller_name ?? row.extracted_supplier_name ?? "—"}</p>
                <p className="text-muted-foreground tabular-nums">
                  {row.extracted_seller_vat ?? row.extracted_supplier_vat ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("finance:reviewQueue.parties.buyer")}
                </p>
                <p className="font-medium">{row.extracted_buyer_name ?? "—"}</p>
                <p className="text-muted-foreground tabular-nums">{row.extracted_buyer_vat ?? "—"}</p>
              </div>
            </div>
            {isUnclear && (
              <div className="space-y-1.5">
                <p className="text-muted-foreground">{t("finance:reviewQueue.parties.unclearHint")}</p>
                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setDirection.isPending}
                      onClick={() => setDirection.mutate("received")}
                    >
                      <ArrowDownLeft className="h-3.5 w-3.5 mr-1.5" />
                      {t("finance:reviewQueue.parties.markReceived")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setDirection.isPending}
                      onClick={() => setDirection.mutate("issued")}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
                      {t("finance:reviewQueue.parties.markIssued")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}



        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border overflow-hidden bg-muted/30 min-h-[320px]">
            {previewUrl ? (
              <div className="flex flex-col">
                {isPdf ? (
                  <PdfCanvasPreview
                    url={previewUrl}
                    className="h-[420px] overflow-y-auto p-2"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt={row.original_filename ?? row.id}
                    className="w-full h-[420px] object-contain"
                  />
                )}
                <button
                  type="button"
                  className="px-2 py-1.5 text-left text-[11px] underline text-muted-foreground"
                  onClick={async () => {
                    // window.open on a blob/storage URL is often blocked
                    // (sandboxed iframe / extensions). Download the bytes and
                    // trigger a local save instead.
                    const bucket = row.source_bucket || BUCKET;
                    const { data: blob } = await supabase.storage
                      .from(bucket)
                      .download(row.source_file_url);
                    const url = blob ? URL.createObjectURL(blob) : previewUrl;
                    if (!url) return;
                    const a = document.createElement("a");
                    a.href = url;
                    a.download =
                      row.original_filename ?? row.source_file_url.split("/").pop() ?? "document";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    if (blob) setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  }}
                >
                  {t("finance:reviewQueue.openInNewTab")}
                </button>

              </div>
            ) : (
              <div className="flex h-[320px] items-center justify-center text-xs text-muted-foreground">
                {t("finance:reviewQueue.loadingPreview")}
              </div>
            )}
          </div>


          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t(isIssued ? "finance:reviewQueue.fields.clientName" : "finance:reviewQueue.fields.supplierName")}>
                <Input
                  value={fields.supplier_name}
                  disabled={readOnly}
                  onChange={(e) => setFields((f) => ({ ...f, supplier_name: e.target.value }))}
                />
              </Field>
              <Field label={t(isIssued ? "finance:reviewQueue.fields.clientVat" : "finance:reviewQueue.fields.supplierVat")}>
                <Input
                  value={fields.supplier_vat}
                  disabled={readOnly}
                  onChange={(e) => setFields((f) => ({ ...f, supplier_vat: e.target.value }))}
                />
              </Field>
              <Field label={t("finance:reviewQueue.fields.documentNumber")}>
                <Input
                  value={fields.document_number}
                  disabled={readOnly}
                  onChange={(e) => setFields((f) => ({ ...f, document_number: e.target.value }))}
                />
              </Field>
              <Field label={t("finance:reviewQueue.fields.date")}>
                <Input
                  type="date"
                  value={fields.date}
                  disabled={readOnly}
                  onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
                />
              </Field>
              <Field label={t("finance:reviewQueue.fields.amount")}>
                <Input
                  inputMode="decimal"
                  value={fields.amount}
                  disabled={readOnly}
                  onChange={(e) => setFields((f) => ({ ...f, amount: e.target.value }))}
                />
              </Field>
              <Field label={t("finance:reviewQueue.fields.vat")}>
                <Input
                  inputMode="decimal"
                  value={fields.vat}
                  disabled={readOnly}
                  onChange={(e) => setFields((f) => ({ ...f, vat: e.target.value }))}
                />
              </Field>
              <Field label={t("finance:reviewQueue.fields.currency")}>
                <Input
                  value={fields.currency}
                  disabled={readOnly}
                  onChange={(e) => setFields((f) => ({ ...f, currency: e.target.value }))}
                />
              </Field>
              {/* Extra reconciliation signals — never required. */}
              <Field label={t("finance:reviewQueue.fields.paymentMethod")}>
                <Select
                  value={fields.payment_method || "none"}
                  disabled={readOnly}
                  onValueChange={(v) =>
                    setFields((f) => ({ ...f, payment_method: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["none", "card", "cash", "bank_transfer", "direct_debit", "not_stated"].map(
                      (v) => (
                        <SelectItem key={v} value={v}>
                          {t(`finance:reviewQueue.paymentMethodValue.${v}`)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("finance:reviewQueue.fields.cardLast4")}>
                <Input
                  value={fields.card_last4}
                  inputMode="numeric"
                  maxLength={4}
                  disabled={readOnly}
                  onChange={(e) => setFields((f) => ({ ...f, card_last4: e.target.value }))}
                />
              </Field>
              {row.extracted_balance_due != null && (
                <Field label={t("finance:reviewQueue.fields.balanceDue")}>
                  <Input
                    value={fmtMoney(row.extracted_balance_due, row.extracted_currency)}
                    readOnly
                    disabled
                  />
                </Field>
              )}
            </div>
            {!readOnly && (

              <Button
                variant="outline"
                size="sm"
                onClick={() => saveFields.mutate()}
                disabled={saveFields.isPending}
              >
                {t("finance:reviewQueue.saveFields")}
              </Button>
            )}
          </div>
        </div>

        {!isBankStatement && <Separator />}

        {/* Supplier checkpoint */}
        {!isBankStatement && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t(isIssued ? "finance:reviewQueue.clientPanel" : "finance:reviewQueue.supplierPanel")}</h3>
            <Badge
              variant={row.supplier_approved_at ? "default" : "outline"}
              className="text-[10px]"
            >
              {row.supplier_approved_at
                ? t("finance:reviewQueue.approvedBadge")
                : t(`finance:reviewQueue.matchStatus.${isIssued ? row.client_match_status : row.supplier_match_status}`, {
                    defaultValue: isIssued ? row.client_match_status : row.supplier_match_status,
                  })}
            </Badge>
          </div>
          {row.supplier_match_status === "ambiguous" && (
            <p className="text-xs text-muted-foreground">
              {t("finance:reviewQueue.ambiguousHint", {
                count: row.ambiguous_supplier_ids?.length ?? 0,
              })}
            </p>
          )}
          {row.supplier_match_status === "no_match" && !supplierId && (
            <p className="text-xs text-muted-foreground">
              {t("finance:reviewQueue.noMatchHint")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={supplierId ?? "__new__"}
              disabled={readOnly}
              onValueChange={(v) => setSupplierId(v === "__new__" ? null : v)}
            >
              <SelectTrigger className="w-[320px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">{t(isIssued ? "finance:reviewQueue.createNewClient" : "finance:reviewQueue.createNewSupplier")}</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                    {s.nif ? ` · ${s.nif}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={readOnly || !!row.supplier_approved_at || doApproveSupplier.isPending}
              onClick={() => doApproveSupplier.mutate()}
            >
              <Check className="h-4 w-4 mr-1.5" />
              {t(isIssued ? "finance:reviewQueue.approveClient" : "finance:reviewQueue.approveSupplier")}
            </Button>
          </div>
        </div>
        )}

        {!isBankStatement && <Separator />}

        {/* Classification checkpoint */}
        {!isBankStatement && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t("finance:reviewQueue.classificationPanel")}</h3>
            <div className="flex items-center gap-2">
              {row.classification_confidence != null && (
                <span className="text-[11px] text-muted-foreground">
                  {t("finance:reviewQueue.confidence", {
                    value: Math.round((row.classification_confidence ?? 0) * 100),
                  })}
                </span>
              )}
              <Badge
                variant={row.classification_approved_at ? "default" : "outline"}
                className="text-[10px]"
              >
                {row.classification_approved_at
                  ? t("finance:reviewQueue.approvedBadge")
                  : t("finance:reviewQueue.pendingBadge")}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ClassificationPicker
              value={classificationId}
              onChange={setClassificationId}
              options={classifications}
              isPt={isPt}
              disabled={readOnly}
              className="w-[380px]"
            />
            <Select
              value={projectId ?? "__none__"}
              disabled={readOnly}
              onValueChange={(v) => setProjectId(v === "__none__" ? null : v)}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder={t("finance:reviewQueue.noProject")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("finance:reviewQueue.noProject")}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isBenefit && (
              <Select
                value={assignedCollaboratorId ?? "__none__"}
                disabled={readOnly}
                onValueChange={(v) =>
                  setAssignedCollaboratorId(v === "__none__" ? null : v)
                }
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder={t("finance:reviewQueue.pickCollaborator")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("finance:reviewQueue.pickCollaborator")}
                  </SelectItem>
                  {(collaboratorsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              size="sm"
              disabled={
                readOnly || !!row.classification_approved_at || doApproveClassification.isPending
              }
              onClick={() => doApproveClassification.mutate()}
            >
              <Check className="h-4 w-4 mr-1.5" />
              {t("finance:reviewQueue.approveClassification")}
            </Button>
          </div>
        </div>
        )}

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("finance:reviewQueue.rejectReason")}
              value={rejectReason}
              disabled={readOnly}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-[240px]"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={readOnly || doReject.isPending}
              onClick={() => doReject.mutate()}
            >
              <X className="h-4 w-4 mr-1.5" />
              {t("finance:reviewQueue.reject")}
            </Button>
          </div>
          {!isBankStatement && (
            <Button
              size="sm"
              disabled={readOnly || !bothApproved || doFinalize.isPending}
              onClick={() => doFinalize.mutate()}
            >
              {t("finance:reviewQueue.finalize")}
            </Button>
          )}
        </div>

        {row.created_expense_id && (
          <p className="text-xs text-muted-foreground">
            {t("finance:reviewQueue.createdExpense", { id: row.created_expense_id })}
          </p>
        )}
        {row.status === "rejected" && row.rejection_reason && (
          <Textarea readOnly value={row.rejection_reason} className="text-xs" />
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
