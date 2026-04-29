/**
 * Document editor route. Handles both:
 *   /finance/documents/new       (id === "new")
 *   /finance/documents/:id       (existing document)
 *
 * Header form + line items + payments + optional file upload.
 */

import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Upload, FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { ClassificationPicker } from "@/components/finance/classification-picker";
import {
  useFinDocument,
  useCreateFinDocument,
  useUpdateFinDocument,
  useCancelFinDocument,
  useIssueFinDocument,
  useAddFinDocPayment,
  useRemoveFinDocPayment,
  useFinSuppliers,
  useFinClients,
  useFinProjects,
  useFinClassifications,
  useUnmatchedBankTxForDoc,
  computeDocTotals,
  type DocumentInput,
  type DocumentInputLine,
  type FinDocType,
  type FinDocDirection,
} from "@/lib/finance/use-documents";

const NONE = "__none__";
const BUCKET = "financial-documents";

const fmtEUR2 = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

async function checkFinanceAccess(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return false;
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) return true;
  const { data: permRow } = await supabase
    .from("user_permissions")
    .select("permission_key")
    .eq("user_id", userId)
    .eq("permission_key", "finance.dashboard")
    .maybeSingle();
  return !!permRow;
}

export const Route = createFileRoute("/_app/finance/documents/$documentId")({
  beforeLoad: async () => {
    const ok = await checkFinanceAccess();
    if (!ok) throw redirect({ to: "/" });
  },
  component: DocumentEditorPage,
});

type LineDraft = DocumentInputLine & { _key: string };

function emptyLine(i = 0): LineDraft {
  return {
    _key: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit_price_ex_vat: 0,
    vat_rate: 23,
    vat_code: null,
    classification_id: null,
    project_id: null,
    reimbursable: false,
    sort_order: i,
  };
}

function defaultDirectionFor(t: FinDocType): FinDocDirection {
  if (t === "supplier_invoice" || t === "supplier_credit_note") return "received";
  return "issued";
}

function DocumentEditorPage() {
  const { documentId } = Route.useParams();
  const isNew = documentId === "new";
  const navigate = useNavigate();
  const { t } = useTranslation(["finance", "common"]);

  const docQ = useFinDocument(isNew ? null : documentId);
  const suppliersQ = useFinSuppliers();
  const clientsQ = useFinClients();
  const projectsQ = useFinProjects();
  const classQ = useFinClassifications();

  const createMut = useCreateFinDocument();
  const updateMut = useUpdateFinDocument();
  const cancelMut = useCancelFinDocument();
  const issueMut = useIssueFinDocument();

  // Header state
  const [header, setHeader] = useState<DocumentInput>({
    doc_type: "supplier_invoice",
    direction: "received",
    issue_date: new Date().toISOString().slice(0, 10),
    currency: "EUR",
    source: "manual",
    status: "draft",
  });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(0)]);

  // Hydrate from server
  useEffect(() => {
    if (!isNew && docQ.data) {
      const d = docQ.data.document;
      setHeader({
        doc_type: d.doc_type,
        direction: d.direction,
        status: d.status,
        source: d.source,
        document_number: d.document_number,
        external_reference: d.external_reference,
        issue_date: d.issue_date,
        due_date: d.due_date,
        counterparty_supplier_id: d.counterparty_supplier_id,
        counterparty_client_id: d.counterparty_client_id,
        counterparty_name_snapshot: d.counterparty_name_snapshot,
        project_id: d.project_id,
        classification_id: d.classification_id,
        currency: d.currency,
        notes: d.notes,
        file_path: d.file_path,
      });
      setLines(
        docQ.data.lines.map((l, i) => ({
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
          sort_order: l.sort_order ?? i,
        })),
      );
    }
  }, [isNew, docQ.data]);

  const totals = useMemo(() => computeDocTotals(lines), [lines]);
  const isReceived = header.direction === "received";
  const readOnly = !isNew && (docQ.data?.document.status === "cancelled");

  function setHeaderType(v: FinDocType) {
    const dir = defaultDirectionFor(v);
    setHeader((h) => ({
      ...h,
      doc_type: v,
      direction: dir,
      // clear opposite counterparty
      counterparty_supplier_id: dir === "received" ? h.counterparty_supplier_id : null,
      counterparty_client_id: dir === "issued" ? h.counterparty_client_id : null,
    }));
  }

  function patchLine(idx: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function uploadAttachment(file: File) {
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setHeader((h) => ({ ...h, file_path: path }));
    toast.success(t("finance:documents.form.uploadFile") as string);
  }

  async function viewAttachment() {
    if (!header.file_path) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(header.file_path, 60);
    if (error || !data) {
      toast.error(error?.message ?? "");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function removeAttachment() {
    if (!header.file_path) return;
    await supabase.storage.from(BUCKET).remove([header.file_path]);
    setHeader((h) => ({ ...h, file_path: null }));
  }

  async function save(asIssued: boolean) {
    // Validation
    if (!header.doc_type) {
      toast.error(t("finance:documents.form.selectType") as string);
      return;
    }
    if (lines.length === 0) {
      toast.error(t("finance:documents.form.noLines") as string);
      return;
    }
    if (lines.some((l) => !l.description.trim())) {
      toast.error(t("finance:documents.form.missingDescription") as string);
      return;
    }
    if (asIssued) {
      if (isReceived && !header.counterparty_supplier_id) {
        toast.error(
          t("finance:documents.form.missingCounterparty", {
            role: t("finance:documents.form.supplier"),
          }) as string,
        );
        return;
      }
      if (!isReceived && !header.counterparty_client_id) {
        toast.error(
          t("finance:documents.form.missingCounterparty", {
            role: t("finance:documents.form.client"),
          }) as string,
        );
        return;
      }
    }
    const payloadLines = lines.map((l, i) => ({
      ...l,
      sort_order: i,
    }));
    const headerPayload: DocumentInput = {
      ...header,
      status: asIssued ? "issued" : header.status ?? "draft",
    };
    if (isNew) {
      const created = await createMut.mutateAsync({
        header: headerPayload,
        lines: payloadLines,
      });
      toast.success(
        t(asIssued ? "finance:documents.form.issued" : "finance:documents.form.savedDraft") as string,
      );
      navigate({
        to: "/finance/documents/$documentId",
        params: { documentId: created.id },
      });
    } else {
      await updateMut.mutateAsync({
        id: documentId,
        header: headerPayload,
        lines: payloadLines,
      });
      toast.success(t("finance:documents.form.saved") as string);
    }
  }

  async function doCancel() {
    if (isNew) return;
    if (!window.confirm(t("finance:documents.form.confirmCancel") as string)) return;
    await cancelMut.mutateAsync(documentId);
    toast.success(t("finance:documents.form.cancelled") as string);
  }

  async function doIssue() {
    if (isNew) return;
    await issueMut.mutateAsync(documentId);
    toast.success(t("finance:documents.form.issued") as string);
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/finance/documents">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("finance:documents.back")}
          </Link>
        </Button>
        {!isNew && docQ.data && (
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {t(`finance:documents.status.${docQ.data.document.status}`)}
            </Badge>
            <Badge variant="secondary">
              {t(`finance:documents.source.${docQ.data.document.source}`)}
            </Badge>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("finance:documents.form.header")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>{t("finance:documents.col.type")}</Label>
            <Select
              value={header.doc_type}
              onValueChange={(v) => setHeaderType(v as FinDocType)}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "supplier_invoice",
                    "supplier_credit_note",
                    "client_invoice",
                    "client_credit_note",
                    "receipt",
                    "other",
                  ] as FinDocType[]
                ).map((dt) => (
                  <SelectItem key={dt} value={dt}>
                    {t(`finance:documents.type.${dt}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t("finance:documents.form.documentNumber")}</Label>
            <Input
              value={header.document_number ?? ""}
              onChange={(e) =>
                setHeader((h) => ({ ...h, document_number: e.target.value }))
              }
              disabled={readOnly}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("finance:documents.form.externalReference")}</Label>
            <Input
              value={header.external_reference ?? ""}
              onChange={(e) =>
                setHeader((h) => ({ ...h, external_reference: e.target.value }))
              }
              disabled={readOnly}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("finance:documents.form.issueDate")}</Label>
            <Input
              type="date"
              value={header.issue_date}
              onChange={(e) =>
                setHeader((h) => ({ ...h, issue_date: e.target.value }))
              }
              disabled={readOnly}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("finance:documents.form.dueDate")}</Label>
            <Input
              type="date"
              value={header.due_date ?? ""}
              onChange={(e) =>
                setHeader((h) => ({ ...h, due_date: e.target.value || null }))
              }
              disabled={readOnly}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("finance:documents.form.currency")}</Label>
            <Input
              value={header.currency ?? "EUR"}
              onChange={(e) =>
                setHeader((h) => ({ ...h, currency: e.target.value }))
              }
              disabled={readOnly}
            />
          </div>

          {isReceived ? (
            <div className="space-y-1 md:col-span-2">
              <Label>{t("finance:documents.form.supplier")}</Label>
              <Select
                value={header.counterparty_supplier_id ?? NONE}
                onValueChange={(v) =>
                  setHeader((h) => ({
                    ...h,
                    counterparty_supplier_id: v === NONE ? null : v,
                  }))
                }
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(suppliersQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1 md:col-span-2">
              <Label>{t("finance:documents.form.client")}</Label>
              <Select
                value={header.counterparty_client_id ?? NONE}
                onValueChange={(v) =>
                  setHeader((h) => ({
                    ...h,
                    counterparty_client_id: v === NONE ? null : v,
                  }))
                }
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(clientsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>{t("finance:documents.form.project")}</Label>
            <Select
              value={header.project_id ?? NONE}
              onValueChange={(v) =>
                setHeader((h) => ({ ...h, project_id: v === NONE ? null : v }))
              }
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {(projectsQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 md:col-span-3">
            <Label>{t("finance:documents.form.notes")}</Label>
            <Textarea
              rows={2}
              value={header.notes ?? ""}
              onChange={(e) => setHeader((h) => ({ ...h, notes: e.target.value }))}
              disabled={readOnly}
            />
          </div>

          <div className="space-y-1 md:col-span-3">
            <Label>{t("finance:documents.form.file")}</Label>
            <div className="flex items-center gap-2">
              {header.file_path ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={viewAttachment}>
                    <FileText className="h-4 w-4 mr-1" />
                    {t("finance:documents.form.viewFile")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeAttachment}
                    disabled={readOnly}
                  >
                    <X className="h-4 w-4 mr-1" />
                    {t("finance:documents.form.removeFile")}
                  </Button>
                </>
              ) : (
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <Upload className="h-4 w-4" />
                  <span>{t("finance:documents.form.uploadFile")}</span>
                  <input
                    type="file"
                    className="hidden"
                    disabled={readOnly}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAttachment(f);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("finance:documents.form.lines")}</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLines((ls) => [...ls, emptyLine(ls.length)])}
            disabled={readOnly}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("finance:documents.form.addLine")}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {t("finance:documents.form.linesHelp")}
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">
                    {t("finance:documents.form.lineDescription")}
                  </TableHead>
                  <TableHead className="w-[80px]">
                    {t("finance:documents.form.lineQuantity")}
                  </TableHead>
                  <TableHead className="w-[120px]">
                    {t("finance:documents.form.lineUnitPrice")}
                  </TableHead>
                  <TableHead className="w-[80px]">
                    {t("finance:documents.form.lineVatRate")}
                  </TableHead>
                  <TableHead className="w-[100px]">
                    {t("finance:documents.form.lineVatCode")}
                  </TableHead>
                  <TableHead className="min-w-[160px]">
                    {t("finance:documents.form.lineClassification")}
                  </TableHead>
                  <TableHead className="min-w-[140px]">
                    {t("finance:documents.form.lineProject")}
                  </TableHead>
                  <TableHead className="w-[60px] text-center">
                    {t("finance:documents.form.lineReimbursable")}
                  </TableHead>
                  <TableHead className="text-right w-[100px]">
                    {t("finance:documents.form.lineGross")}
                  </TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => {
                  const net = l.quantity * l.unit_price_ex_vat;
                  const vat = net * (l.vat_rate / 100);
                  const gross = net + vat;
                  return (
                    <TableRow key={l._key}>
                      <TableCell>
                        <Input
                          value={l.description}
                          onChange={(e) => patchLine(i, { description: e.target.value })}
                          disabled={readOnly}
                        />
                        <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                          {t("finance:documents.form.linePreview", {
                            net: fmtEUR2(net),
                            vat: fmtEUR2(vat),
                            gross: fmtEUR2(gross),
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={l.quantity}
                          onChange={(e) =>
                            patchLine(i, { quantity: Number(e.target.value || 0) })
                          }
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={l.unit_price_ex_vat}
                          onChange={(e) =>
                            patchLine(i, { unit_price_ex_vat: Number(e.target.value || 0) })
                          }
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={l.vat_rate}
                          onChange={(e) =>
                            patchLine(i, { vat_rate: Number(e.target.value || 0) })
                          }
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.vat_code ?? ""}
                          onChange={(e) =>
                            patchLine(i, { vat_code: e.target.value || null })
                          }
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={l.classification_id ?? NONE}
                          onValueChange={(v) =>
                            patchLine(i, { classification_id: v === NONE ? null : v })
                          }
                          disabled={readOnly}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>—</SelectItem>
                            {(classQ.data ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.code} — {c.name_pt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={l.project_id ?? NONE}
                          onValueChange={(v) =>
                            patchLine(i, { project_id: v === NONE ? null : v })
                          }
                          disabled={readOnly}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>—</SelectItem>
                            {(projectsQ.data ?? []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={!!l.reimbursable}
                          onChange={(e) =>
                            patchLine(i, { reimbursable: e.target.checked })
                          }
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEUR2(gross)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setLines((ls) => ls.filter((_, idx) => idx !== i))
                          }
                          disabled={readOnly}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end mt-4 gap-6 text-sm">
            <div>
              <div className="text-muted-foreground">
                {t("finance:documents.form.subtotal")}
              </div>
              <div className="text-right tabular-nums font-medium">
                {fmtEUR2(totals.subtotal_ex_vat)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">
                {t("finance:documents.form.vat")}
              </div>
              <div className="text-right tabular-nums font-medium">
                {fmtEUR2(totals.vat_amount)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">
                {t("finance:documents.form.total")}
              </div>
              <div className="text-right tabular-nums font-semibold text-base">
                {fmtEUR2(totals.total_inc_vat)}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            {!isNew && docQ.data?.document.status !== "cancelled" && (
              <Button variant="ghost" onClick={doCancel}>
                {t("finance:documents.form.cancelDoc")}
              </Button>
            )}
            {!isNew && docQ.data?.document.status === "draft" && (
              <Button variant="secondary" onClick={doIssue}>
                {t("finance:documents.form.issue")}
              </Button>
            )}
            <Button variant="outline" onClick={() => save(false)} disabled={readOnly}>
              {t("finance:documents.form.saveDraft")}
            </Button>
            <Button onClick={() => save(true)} disabled={readOnly}>
              {t("finance:documents.form.issue")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!isNew && docQ.data && (
        <PaymentsSection documentId={documentId} doc={docQ.data.document} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function PaymentsSection({
  documentId,
  doc,
}: {
  documentId: string;
  doc: NonNullable<ReturnType<typeof useFinDocument>["data"]>["document"];
}) {
  const { t } = useTranslation(["finance"]);
  const docQ = useFinDocument(documentId);
  const addPay = useAddFinDocPayment();
  const removePay = useRemoveFinDocPayment();
  const matchesQ = useUnmatchedBankTxForDoc(doc);

  const [matchOpen, setMatchOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState<number>(
    Number(doc.outstanding_amount ?? 0),
  );
  const [manualDate, setManualDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [manualMethod, setManualMethod] =
    useState<"bank_transfer" | "cash" | "card" | "direct_debit" | "other">("bank_transfer");

  const outstanding = Number(doc.outstanding_amount ?? 0);

  // Reset manual form to current outstanding whenever dialog opens or
  // outstanding changes (e.g. after a partial payment).
  useEffect(() => {
    if (manualOpen) {
      setManualAmount(outstanding);
      setManualDate(new Date().toISOString().slice(0, 10));
      setManualMethod("bank_transfer");
    }
  }, [manualOpen, outstanding]);

  async function addManual() {
    if (!Number.isFinite(manualAmount) || manualAmount <= 0) {
      toast.error(t("finance:documents.payments.amountInvalid") as string);
      return;
    }
    if (manualAmount > outstanding + 0.005) {
      toast.error(t("finance:documents.payments.exceedsOutstanding") as string);
      return;
    }
    await addPay.mutateAsync({
      document_id: documentId,
      amount: manualAmount,
      payment_date: manualDate,
      method: manualMethod,
    });
    toast.success(t("finance:documents.payments.added") as string);
    setManualOpen(false);
  }

  async function matchTx(txId: string, txAmount: number, txDate: string) {
    const amt = Math.min(Math.abs(Number(txAmount)), outstanding);
    if (amt <= 0) return;
    await addPay.mutateAsync({
      document_id: documentId,
      bank_transaction_id: txId,
      amount: amt,
      payment_date: txDate,
      method: "bank_transfer",
    });
    toast.success(t("finance:documents.bankMatch.matched") as string);
    setMatchOpen(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("finance:documents.payments.title")}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMatchOpen(true)}>
            {t("finance:documents.payments.matchBank")}
          </Button>
          <Button size="sm" onClick={() => setManualOpen(true)}>
            {t("finance:documents.payments.addManual")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {(docQ.data?.payments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("finance:documents.payments.noPayments")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance:documents.payments.date")}</TableHead>
                <TableHead className="text-right">
                  {t("finance:documents.payments.amount")}
                </TableHead>
                <TableHead>{t("finance:documents.payments.method")}</TableHead>
                <TableHead>{t("finance:documents.payments.bankTx")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(docQ.data?.payments ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{fmtDate(p.payment_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtEUR2(Number(p.amount))}
                  </TableCell>
                  <TableCell>
                    {t(`finance:documents.payments.methods.${p.method}`)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.bank_transaction_id
                      ? t("finance:documents.payments.matched")
                      : t("finance:documents.payments.manual")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        removePay.mutate({ id: p.id, documentId })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Manual payment dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finance:documents.payments.addManual")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("finance:documents.payments.amount")}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={outstanding}
                value={manualAmount}
                onChange={(e) => setManualAmount(Number(e.target.value || 0))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("finance:documents.payments.outstandingHint", {
                  amount: fmtEUR2(outstanding),
                })}
              </p>
            </div>
            <div>
              <Label>{t("finance:documents.payments.date")}</Label>
              <Input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("finance:documents.payments.method")}</Label>
              <Select value={manualMethod} onValueChange={(v) => setManualMethod(v as typeof manualMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["bank_transfer", "cash", "card", "direct_debit", "other"] as const).map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`finance:documents.payments.methods.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={addManual}>{t("finance:documents.form.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank match dialog */}
      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("finance:documents.bankMatch.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("finance:documents.bankMatch.subtitle")}
          </p>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance:documents.payments.date")}</TableHead>
                  <TableHead>{t("finance:documents.payments.bankTx")}</TableHead>
                  <TableHead className="text-right">
                    {t("finance:documents.payments.amount")}
                  </TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(matchesQ.data ?? []).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{fmtDate(tx.transaction_date)}</TableCell>
                    <TableCell className="text-xs">{tx.description}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR2(Number(tx.amount))}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() =>
                          matchTx(tx.id, Number(tx.amount), tx.transaction_date)
                        }
                      >
                        {t("finance:documents.payments.matchBank")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
