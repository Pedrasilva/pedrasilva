/**
 * Fast modal: create a financial_document (with one line and a payment link)
 * starting from a bank transaction.
 *
 * Rules:
 *  - bank_transactions are NOT mutated.
 *  - financial_documents + financial_document_lines are created.
 *  - financial_document_payments is created with bank_transaction_id set, so
 *    the recalc trigger updates paid_amount/status automatically.
 *  - Direction inferred from sign of bank tx amount:
 *      negative -> received (supplier_invoice)
 *      positive -> issued (client_invoice)
 *  - Inline create supplier/client supported via InlineCounterpartyDialog.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Paperclip, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  useCreateFinDocument,
  useAddFinDocPayment,
  useFinSuppliers,
  useFinClients,
  useFinProjects,
  useFinClassifications,
  type FinDocType,
  type FinDocDirection,
} from "@/lib/finance/use-documents";
import { useSupplierDefaultClassifications } from "@/lib/finance/use-supplier-classifications";
import { ClassificationPicker } from "@/components/finance/classification-picker";
import { InlineCounterpartyDialog } from "@/components/finance/inline-counterparty-dialog";
import { VatPresetPicker } from "@/components/finance/vat-preset-picker";

const BUCKET = "financial-documents";

type BankTxLite = {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  currency: string;
};

type Props = {
  tx: BankTxLite;
  onClose: () => void;
  onCreated?: () => void;
};

const round2 = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export function CreateDocFromTxDialog({ tx, onClose, onCreated }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const isPt = i18n.language?.startsWith("pt");
  const { user } = useAuth();
  const qc = useQueryClient();

  const isReceived = tx.amount < 0; // money out -> supplier invoice
  const initialDirection: FinDocDirection = isReceived ? "received" : "issued";
  const initialDocType: FinDocType = isReceived
    ? "supplier_invoice"
    : "client_invoice";

  const [docType, setDocType] = useState<FinDocType>(initialDocType);
  const [direction, setDirection] =
    useState<FinDocDirection>(initialDirection);

  // Counterparty
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [createSupplier, setCreateSupplier] = useState(false);
  const [createClient, setCreateClient] = useState(false);

  const suppliersQ = useFinSuppliers();
  const clientsQ = useFinClients();
  const projectsQ = useFinProjects();
  const classificationsQ = useFinClassifications();
  const supplierClassQ = useSupplierDefaultClassifications();

  // Header fields
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState(tx.transaction_date);
  const [description, setDescription] = useState(tx.description);
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [nif, setNif] = useState("");

  // Money: edit gross OR (net + vat rate); we keep gross as the source of truth.
  const [grossAmount, setGrossAmount] = useState<string>(
    Math.abs(tx.amount).toFixed(2),
  );
  const [vatRate, setVatRate] = useState<string>("23");
  const [vatCode, setVatCode] = useState<string | null>("NOR");

  // Attachment
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const create = useCreateFinDocument();
  const addPayment = useAddFinDocPayment();

  // Direction toggle keeps doc_type aligned to common case
  function toggleDirection(next: FinDocDirection) {
    setDirection(next);
    if (next === "received" && docType === "client_invoice") {
      setDocType("supplier_invoice");
    } else if (next === "issued" && docType === "supplier_invoice") {
      setDocType("client_invoice");
    }
  }

  // When supplier picked, suggest classification
  useEffect(() => {
    if (!supplierId) return;
    const suggested = supplierClassQ.data?.[supplierId];
    if (suggested && !classificationId) setClassificationId(suggested);
  }, [supplierId, supplierClassQ.data, classificationId]);

  const totals = useMemo(() => {
    const gross = Number(grossAmount) || 0;
    const rate = Number(vatRate) || 0;
    const net = round2(gross / (1 + rate / 100));
    const vat = round2(gross - net);
    return { gross: round2(gross), net, vat };
  }, [grossAmount, vatRate]);

  async function uploadAttachment(documentId: string): Promise<string | null> {
    if (!file) return null;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${documentId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false });
      if (error) throw error;
      return path;
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    // Validation
    if (!issueDate) {
      toast.error(t("finance:createDoc.issueDateRequired"));
      return;
    }
    const gross = Number(grossAmount);
    if (!Number.isFinite(gross) || gross <= 0) {
      toast.error(t("finance:createDoc.grossRequired"));
      return;
    }
    const counterpartyId = direction === "received" ? supplierId : clientId;
    if (!counterpartyId) {
      toast.error(
        direction === "received"
          ? t("finance:createDoc.supplierRequired")
          : t("finance:createDoc.clientRequired"),
      );
      return;
    }

    const counterpartyName =
      direction === "received"
        ? suppliersQ.data?.find((s) => s.id === counterpartyId)?.name ?? null
        : clientsQ.data?.find((c) => c.id === counterpartyId)?.name ?? null;

    try {
      // 1. Create the document with one line
      const doc = await create.mutateAsync({
        header: {
          doc_type: docType,
          direction,
          status: "issued",
          source: "manual",
          document_number: documentNumber.trim() || null,
          external_reference: null,
          issue_date: issueDate,
          counterparty_supplier_id:
            direction === "received" ? counterpartyId : null,
          counterparty_client_id:
            direction === "issued" ? counterpartyId : null,
          counterparty_name_snapshot: counterpartyName,
          project_id: projectId,
          classification_id: classificationId,
          currency: tx.currency || "EUR",
          notes:
            [
              description.trim() ? description.trim() : null,
              nif.trim() ? `NIF: ${nif.trim()}` : null,
              `Created from bank transaction ${tx.id}`,
            ]
              .filter(Boolean)
              .join("\n") || null,
        },
        lines: [
          {
            description: description.trim() || tx.description,
            quantity: 1,
            unit_price_ex_vat: totals.net,
            vat_rate: Number(vatRate) || 0,
            vat_code: vatCode,
            classification_id: classificationId,
            project_id: projectId,
            reimbursable: false,
          },
        ],
      });

      // 2. Optional attachment
      if (file) {
        const path = await uploadAttachment(doc.id);
        if (path) {
          await supabase
            .from("financial_documents")
            .update({ file_path: path })
            .eq("id", doc.id);
        }
      }

      // 3. Payment link to the bank transaction
      await addPayment.mutateAsync({
        document_id: doc.id,
        bank_transaction_id: tx.id,
        amount: totals.gross,
        payment_date: tx.transaction_date,
        method: "bank_transfer",
        created_by: user?.id ?? null,
      });

      toast.success(t("finance:createDoc.created"));
      qc.invalidateQueries({ queryKey: ["finance", "bank-tx"] });
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = create.isPending || addPayment.isPending || uploading;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("finance:createDoc.title")}</DialogTitle>
        </DialogHeader>

        {/* Source bank transaction summary */}
        <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/30">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("finance:bankRec.col.date")}
            </span>
            <span>{tx.transaction_date}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground shrink-0">
              {t("finance:bankRec.col.description")}
            </span>
            <span className="truncate text-right" title={tx.description}>
              {tx.description}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("finance:bankRec.col.amount")}
            </span>
            <span
              className={`tabular-nums font-medium ${
                tx.amount < 0 ? "text-destructive" : "text-emerald-600"
              }`}
            >
              {tx.amount.toFixed(2)} {tx.currency}
            </span>
          </div>
          <div className="pt-1">
            <Badge variant="outline" className="text-[10px]">
              {direction === "received"
                ? t("finance:createDoc.directionReceived")
                : t("finance:createDoc.directionIssued")}
            </Badge>
          </div>
        </div>

        <div className="space-y-3">
          {/* Direction + doc type */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">
                {t("finance:createDoc.direction")}
              </Label>
              <Select
                value={direction}
                onValueChange={(v) => toggleDirection(v as FinDocDirection)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">
                    {t("finance:createDoc.directionReceived")}
                  </SelectItem>
                  <SelectItem value="issued">
                    {t("finance:createDoc.directionIssued")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {t("finance:createDoc.docType")}
              </Label>
              <Select
                value={docType}
                onValueChange={(v) => setDocType(v as FinDocType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {direction === "received" ? (
                    <>
                      <SelectItem value="supplier_invoice">
                        {t("finance:createDoc.types.supplier_invoice")}
                      </SelectItem>
                      <SelectItem value="supplier_credit_note">
                        {t("finance:createDoc.types.supplier_credit_note")}
                      </SelectItem>
                      <SelectItem value="receipt">
                        {t("finance:createDoc.types.receipt")}
                      </SelectItem>
                      <SelectItem value="other">
                        {t("finance:createDoc.types.other")}
                      </SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="client_invoice">
                        {t("finance:createDoc.types.client_invoice")}
                      </SelectItem>
                      <SelectItem value="client_credit_note">
                        {t("finance:createDoc.types.client_credit_note")}
                      </SelectItem>
                      <SelectItem value="receipt">
                        {t("finance:createDoc.types.receipt")}
                      </SelectItem>
                      <SelectItem value="other">
                        {t("finance:createDoc.types.other")}
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Counterparty */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">
                {direction === "received"
                  ? t("finance:bankRec.supplier")
                  : t("finance:bankRec.client")}
                {" *"}
              </Label>
              <div className="flex gap-1">
                <div className="flex-1">
                  <Select
                    value={
                      direction === "received"
                        ? supplierId ?? "__none"
                        : clientId ?? "__none"
                    }
                    onValueChange={(v) => {
                      const next = v === "__none" ? null : v;
                      if (direction === "received") setSupplierId(next);
                      else setClientId(next);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[260px]">
                      <SelectItem value="__none">—</SelectItem>
                      {(direction === "received"
                        ? suppliersQ.data ?? []
                        : clientsQ.data ?? []
                      ).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    direction === "received"
                      ? setCreateSupplier(true)
                      : setCreateClient(true)
                  }
                  title={t("finance:inlineCounterparty.newSupplier") as string}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">
                {t("finance:inlineCounterparty.nif")}
              </Label>
              <Input
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                placeholder={t("finance:createDoc.nifPlaceholder") as string}
              />
            </div>
          </div>

          {/* Document number / issue date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">
                {t("finance:createDoc.documentNumber")}
              </Label>
              <Input
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder={t("finance:createDoc.documentNumberPlaceholder") as string}
              />
            </div>
            <div>
              <Label className="text-xs">
                {t("finance:createDoc.issueDate")}
              </Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs">
              {t("finance:bankRec.col.description")}
            </Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Classification + project */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">
                {t("finance:bankRec.classification")}
              </Label>
              <ClassificationPicker
                value={classificationId}
                onChange={setClassificationId}
                options={classificationsQ.data ?? []}
                isPt={isPt}
                placeholder={t("finance:bankRec.selectClassification")}
                suggestedIds={
                  supplierId && supplierClassQ.data?.[supplierId]
                    ? [supplierClassQ.data[supplierId]]
                    : []
                }
              />
            </div>
            <div>
              <Label className="text-xs">
                {t("finance:bankRec.project")}
              </Label>
              <Select
                value={projectId ?? "__none"}
                onValueChange={(v) =>
                  setProjectId(v === "__none" ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
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

          {/* Money */}
          <div className="grid grid-cols-3 gap-2 items-end">
            <div>
              <Label className="text-xs">
                {t("finance:createDoc.vatRate")}
              </Label>
              <div className="space-y-1">
                <VatPresetPicker
                  onPick={(rate, code) => {
                    setVatRate(String(rate));
                    setVatCode(code);
                  }}
                />
                <Input
                  type="number"
                  step="0.01"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">
                {t("finance:createDoc.gross")}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={grossAmount}
                onChange={(e) => setGrossAmount(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>
                {t("finance:createDoc.net")}:{" "}
                <span className="tabular-nums font-medium text-foreground">
                  {totals.net.toFixed(2)}
                </span>
              </div>
              <div>
                {t("finance:createDoc.vat")}:{" "}
                <span className="tabular-nums font-medium text-foreground">
                  {totals.vat.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Attachment */}
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Paperclip className="size-3" />
              {t("finance:createDoc.attachment")}
            </Label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("common:cancel")}
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
            {t("finance:createDoc.createAndLink")}
          </Button>
        </DialogFooter>

        {createSupplier && (
          <InlineCounterpartyDialog
            kind="supplier"
            open={createSupplier}
            onOpenChange={setCreateSupplier}
            onCreated={(row) => {
              setSupplierId(row.id);
            }}
          />
        )}
        {createClient && (
          <InlineCounterpartyDialog
            kind="client"
            open={createClient}
            onOpenChange={setCreateClient}
            onCreated={(row) => {
              setClientId(row.id);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
