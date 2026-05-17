/**
 * Purchase editor — multi-line supplier invoice / credit note workspace.
 *
 * Wires to:
 *  - financial_documents (direction='received')
 *  - financial_document_lines (multi-line, with VAT + classification + project)
 *
 * Status workflow:
 *   draft → issued (confirm)
 *   draft | issued → cancelled
 *   paid / partially_paid are derived from financial_document_payments via DB trigger.
 *
 * No payments UI here — payments are recorded from Bank Reconciliation or the
 * upcoming Payments workspace, which keeps cash truth on `bank_transactions`.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, FileText, X, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInputWithPreview } from "@/components/finance/date-input-with-preview";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  useFinDocument,
  useCreateFinDocument,
  useUpdateFinDocument,
  useCancelFinDocument,
  useIssueFinDocument,
  useFinSuppliers,
  useFinProjects,
  useFinClassifications,
  computeDocTotals,
  type FinDocType,
  type DocumentInputLine,
} from "@/lib/finance/use-documents";
import { ClassificationPicker } from "@/components/finance/classification-picker";
import { InlineCounterpartyDialog } from "@/components/finance/inline-counterparty-dialog";
import { DocumentSettlementSection } from "@/components/finance/document-settlement-section";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  documentId: string | null; // null = create mode
  onClose: () => void;
};

type EditorLine = DocumentInputLine & { _key: string };

const newLine = (): EditorLine => ({
  _key: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unit_price_ex_vat: 0,
  vat_rate: 23,
  vat_code: "NOR",
  classification_id: null,
  project_id: null,
  reimbursable: false,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(n);

export function PurchaseEditorDialog({ open, documentId, onClose }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const isPt = i18n.language?.startsWith("pt");

  const existing = useFinDocument(documentId);
  const create = useCreateFinDocument();
  const update = useUpdateFinDocument();
  const cancelDoc = useCancelFinDocument();
  const issueDoc = useIssueFinDocument();

  const suppliersQ = useFinSuppliers();
  const projectsQ = useFinProjects();
  const classificationsQ = useFinClassifications();

  // Header state
  const [docType, setDocType] = useState<FinDocType>("supplier_invoice");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);
  const [createSupplier, setCreateSupplier] = useState(false);

  // Hydrate when editing
  useEffect(() => {
    if (!open) return;
    if (!documentId) {
      // create mode reset
      setDocType("supplier_invoice");
      setSupplierId(null);
      setDocumentNumber("");
      setExternalReference("");
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate("");
      setProjectId(null);
      setClassificationId(null);
      setNotes("");
      setLines([newLine()]);
      return;
    }
    const full = existing.data;
    if (!full) return;
    setDocType(full.document.doc_type);
    setSupplierId(full.document.counterparty_supplier_id);
    setDocumentNumber(full.document.document_number ?? "");
    setExternalReference(full.document.external_reference ?? "");
    setIssueDate(full.document.issue_date);
    setDueDate(full.document.due_date ?? "");
    setProjectId(full.document.project_id);
    setClassificationId(full.document.classification_id);
    setNotes(full.document.notes ?? "");
    setLines(
      full.lines.length > 0
        ? full.lines.map((l) => ({
            _key: l.id,
            description: l.description,
            quantity: Number(l.quantity),
            unit_price_ex_vat: Number(l.unit_price_ex_vat),
            vat_rate: Number(l.vat_rate),
            vat_code: l.vat_code,
            classification_id: l.classification_id,
            project_id: l.project_id,
            reimbursable: l.reimbursable,
            notes: l.notes,
          }))
        : [newLine()],
    );
  }, [open, documentId, existing.data]);

  const totals = useMemo(() => computeDocTotals(lines), [lines]);
  const status = existing.data?.document.status ?? "draft";
  const isReadOnly = status === "cancelled" || status === "paid";
  const isExisting = !!documentId;

  function updateLine(key: string, patch: Partial<EditorLine>) {
    setLines((prev) =>
      prev.map((l) => (l._key === key ? { ...l, ...patch } : l)),
    );
  }
  function removeLine(key: string) {
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((l) => l._key !== key),
    );
  }
  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function validate(): string | null {
    if (!supplierId) return t("finance:purchases.errors.supplierRequired");
    if (!issueDate) return t("finance:purchases.errors.issueDateRequired");
    if (lines.length === 0)
      return t("finance:purchases.errors.linesRequired");
    for (const l of lines) {
      if (!l.description.trim())
        return t("finance:purchases.errors.lineDescription");
      if (!(l.quantity > 0))
        return t("finance:purchases.errors.lineQuantity");
      if (!(l.unit_price_ex_vat >= 0))
        return t("finance:purchases.errors.linePrice");
    }
    return null;
  }

  async function handleSave(nextStatus?: "draft" | "issued") {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const supplierName =
      suppliersQ.data?.find((s) => s.id === supplierId)?.name ?? null;

    const header = {
      doc_type: docType,
      direction: "received" as const,
      source: "manual" as const,
      status: nextStatus ?? (status as "draft" | "issued"),
      document_number: documentNumber.trim() || null,
      external_reference: externalReference.trim() || null,
      issue_date: issueDate,
      due_date: dueDate || null,
      counterparty_supplier_id: supplierId,
      counterparty_client_id: null,
      counterparty_name_snapshot: supplierName,
      project_id: projectId,
      classification_id: classificationId,
      currency: "EUR",
      notes: notes.trim() || null,
    };

    const payloadLines: DocumentInputLine[] = lines.map((l, i) => ({
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unit_price_ex_vat: Number(l.unit_price_ex_vat),
      vat_rate: Number(l.vat_rate),
      vat_code: l.vat_code ?? null,
      classification_id: l.classification_id ?? classificationId,
      project_id: l.project_id ?? projectId,
      reimbursable: !!l.reimbursable,
      notes: l.notes ?? null,
      sort_order: i,
    }));

    try {
      if (isExisting && documentId) {
        await update.mutateAsync({
          id: documentId,
          header,
          lines: payloadLines,
        });
        toast.success(t("finance:purchases.saved"));
      } else {
        await create.mutateAsync({ header, lines: payloadLines });
        toast.success(t("finance:purchases.created"));
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleConfirm() {
    if (isExisting && documentId && status === "draft") {
      // Save edits then flip status
      await handleSave("issued");
      return;
    }
    if (isExisting && documentId) {
      try {
        await issueDoc.mutateAsync(documentId);
        toast.success(t("finance:purchases.confirmed"));
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    } else {
      await handleSave("issued");
    }
  }

  async function handleCancel() {
    if (!documentId) return;
    if (!confirm(t("finance:purchases.cancelConfirm") as string)) return;
    try {
      await cancelDoc.mutateAsync(documentId);
      toast.success(t("finance:purchases.cancelled"));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const busy =
    create.isPending ||
    update.isPending ||
    cancelDoc.isPending ||
    issueDoc.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
          <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur px-6 py-4">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-lg">
                    {isExisting
                      ? t("finance:purchases.editTitle")
                      : t("finance:purchases.newTitle")}
                  </DialogTitle>
                  <StatusBadge status={status} />
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    {t("finance:purchases.totalLabel")}
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmt(totals.total_inc_vat)}
                  </div>
                </div>
              </div>
              <DialogDescription className="text-xs">
                {t("finance:purchases.editorSubtitle")}
              </DialogDescription>
            </DialogHeader>
          </div>

          {existing.isLoading && documentId ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" />
              {t("common:loading")}
            </div>
          ) : (
            <div className="px-6 py-5 space-y-6">
              {/* Header — counterparty & metadata */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("finance:purchases.section.header")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <Label className="text-xs">
                      {t("finance:purchases.supplier")} *
                    </Label>
                    <div className="flex gap-1">
                      <Select
                        value={supplierId ?? "__none"}
                        onValueChange={(v) =>
                          setSupplierId(v === "__none" ? null : v)
                        }
                        disabled={isReadOnly}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("finance:purchases.supplierPick")}
                          />
                        </SelectTrigger>
                        <SelectContent className="max-h-[280px]">
                          <SelectItem value="__none">—</SelectItem>
                          {(suppliersQ.data ?? []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCreateSupplier(true)}
                        disabled={isReadOnly}
                        title={t("finance:inlineCounterparty.newSupplier") as string}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">
                      {t("finance:purchases.docType")}
                    </Label>
                    <Select
                      value={docType}
                      onValueChange={(v) => setDocType(v as FinDocType)}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supplier_invoice">
                          {t("finance:createDoc.types.supplier_invoice")}
                        </SelectItem>
                        <SelectItem value="supplier_credit_note">
                          {t("finance:createDoc.types.supplier_credit_note")}
                        </SelectItem>
                        <SelectItem value="other">
                          {t("finance:createDoc.types.other")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">
                      {t("finance:purchases.documentNumber")}
                    </Label>
                    <Input
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="FT 2026/123"
                      disabled={isReadOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      {t("finance:purchases.externalRef")}
                    </Label>
                    <Input
                      value={externalReference}
                      onChange={(e) => setExternalReference(e.target.value)}
                      placeholder={t("finance:purchases.externalRefHint") as string}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      {t("finance:purchases.issueDate")} *
                    </Label>
                    <DateInputWithPreview
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      {t("finance:purchases.dueDate")}
                    </Label>
                    <DateInputWithPreview
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      disabled={isReadOnly}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">
                      {t("finance:purchases.defaultClassification")}
                    </Label>
                    <ClassificationPicker
                      value={classificationId}
                      onChange={setClassificationId}
                      options={classificationsQ.data ?? []}
                      isPt={!!isPt}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      {t("finance:purchases.project")}
                    </Label>
                    <Select
                      value={projectId ?? "__none"}
                      onValueChange={(v) =>
                        setProjectId(v === "__none" ? null : v)
                      }
                      disabled={isReadOnly}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("finance:purchases.projectPick")}
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        <SelectItem value="__none">—</SelectItem>
                        {(projectsQ.data ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <Separator />

              {/* Lines */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("finance:purchases.section.lines")}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addLine}
                    disabled={isReadOnly}
                  >
                    <Plus className="size-4 mr-1" />
                    {t("finance:purchases.addLine")}
                  </Button>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const lineEx = line.quantity * line.unit_price_ex_vat;
                    const lineInc = lineEx * (1 + line.vat_rate / 100);
                    return (
                      <div
                        key={line._key}
                        className="rounded-lg border bg-card/50 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {t("finance:purchases.line")} {idx + 1}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums font-medium text-foreground">
                              {fmt(lineInc)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => removeLine(line._key)}
                              disabled={isReadOnly || lines.length === 1}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-12 md:col-span-6">
                            <Input
                              value={line.description}
                              onChange={(e) =>
                                updateLine(line._key, {
                                  description: e.target.value,
                                })
                              }
                              placeholder={
                                t("finance:purchases.lineDescription") as string
                              }
                              disabled={isReadOnly}
                            />
                          </div>
                          <div className="col-span-3 md:col-span-1">
                            <Input
                              type="number"
                              step="0.01"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(line._key, {
                                  quantity: Number(e.target.value) || 0,
                                })
                              }
                              className="text-right tabular-nums"
                              disabled={isReadOnly}
                            />
                          </div>
                          <div className="col-span-5 md:col-span-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={line.unit_price_ex_vat}
                              onChange={(e) =>
                                updateLine(line._key, {
                                  unit_price_ex_vat:
                                    Number(e.target.value) || 0,
                                })
                              }
                              className="text-right tabular-nums"
                              placeholder={t("finance:purchases.unitPrice") as string}
                              disabled={isReadOnly}
                            />
                          </div>
                          <div className="col-span-4 md:col-span-1">
                            <Input
                              type="number"
                              step="0.5"
                              value={line.vat_rate}
                              onChange={(e) =>
                                updateLine(line._key, {
                                  vat_rate: Number(e.target.value) || 0,
                                })
                              }
                              className="text-right tabular-nums"
                              disabled={isReadOnly}
                            />
                          </div>
                          <div className="col-span-12 md:col-span-2">
                            <ClassificationPicker
                              value={line.classification_id ?? null}
                              onChange={(v) =>
                                updateLine(line._key, {
                                  classification_id: v,
                                })
                              }
                              options={classificationsQ.data ?? []}
                              isPt={!!isPt}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <Separator />

              {/* Notes */}
              <section className="space-y-2">
                <Label className="text-xs">{t("finance:purchases.notes")}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  disabled={isReadOnly}
                />
              </section>

              {isExisting && existing.data ? (
                <>
                  <Separator />
                  <DocumentSettlementSection
                    payments={existing.data.payments}
                    currency={existing.data.document.currency ?? "EUR"}
                  />
                </>
              ) : null}
            </div>
          )}

          {/* Sticky totals + actions */}
          <div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur px-6 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-6 text-sm">
                <Total label={t("finance:purchases.subtotal")} value={totals.subtotal_ex_vat} />
                <Total label={t("finance:purchases.vat")} value={totals.vat_amount} />
                <Total
                  label={t("finance:purchases.total")}
                  value={totals.total_inc_vat}
                  highlight
                />
              </div>
              <div className="flex items-center gap-2">
                {isExisting && status !== "cancelled" && status !== "paid" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={busy}
                  >
                    <X className="size-4 mr-1" />
                    {t("finance:purchases.cancel")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={busy}
                >
                  {t("common:close")}
                </Button>
                {!isReadOnly && (
                  <>
                    {status === "draft" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSave("draft")}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4 mr-1" />}
                        {t("finance:purchases.saveDraft")}
                      </Button>
                    )}
                    <Button size="sm" onClick={handleConfirm} disabled={busy}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 mr-1" />}
                      {status === "draft"
                        ? t("finance:purchases.confirm")
                        : t("finance:purchases.save")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InlineCounterpartyDialog
        kind="supplier"
        open={createSupplier}
        onOpenChange={setCreateSupplier}
        onCreated={(row) => setSupplierId(row.id)}
      />
    </>
  );
}

function Total({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums font-medium",
          highlight && "text-lg font-semibold",
        )}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation(["finance"]);
  const map: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; cls?: string }> = {
    draft: { variant: "outline" },
    issued: { variant: "secondary" },
    partially_paid: { variant: "secondary", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
    paid: { variant: "default", cls: "bg-emerald-600 hover:bg-emerald-600" },
    cancelled: { variant: "destructive" },
  };
  const cfg = map[status] ?? { variant: "outline" as const };
  return (
    <Badge variant={cfg.variant} className={cfg.cls}>
      {t(`finance:purchases.status.${status}`)}
    </Badge>
  );
}
