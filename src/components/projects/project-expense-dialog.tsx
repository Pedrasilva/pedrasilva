import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  useUpsertProjectExpense,
  type ExpenseCategory,
  type ExpenseStatus,
  type ProjectExpense,
} from "@/lib/projects/use-project-expenses";
import {
  projectExpenseSchema,
  flattenIssues,
} from "@/lib/projects/financial-validation";
import { SupplierPicker } from "./supplier-picker";
import type { Supplier } from "@/lib/projects/use-suppliers";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import { useCollaboratorsList } from "@/lib/hr/use-collaborators";

type PaymentSourceType =
  | "personal"
  | "company_card"
  | "company_account"
  | "cash"
  | "unknown";

const PAYMENT_SOURCES: PaymentSourceType[] = [
  "personal",
  "company_card",
  "company_account",
  "cash",
  "unknown",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  initial?: (ProjectExpense & { supplier_id?: string | null }) | null;
}

export function ProjectExpenseDialog({ open, onOpenChange, projectId, initial }: Props) {
  const { t } = useTranslation("projects");
  const upsert = useUpsertProjectExpense(projectId);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("misc");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  // Legacy mirror — keeps free-text vendor name for old rows / exports.
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [incurredAt, setIncurredAt] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("draft");
  const [paidAt, setPaidAt] = useState("");
  const [rebillable, setRebillable] = useState(false);
  const [notes, setNotes] = useState("");
  // Receipt + tax + payment detail — same submission logic as a personal
  // (reimbursable) expense, so a project cost can be both charged to the
  // client and paid back to the person who advanced the money.
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [supplierNif, setSupplierNif] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [amountExVat, setAmountExVat] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [paymentSourceType, setPaymentSourceType] =
    useState<PaymentSourceType>("company_account");
  const [paymentSourceLabel, setPaymentSourceLabel] = useState("");
  const [reimbursable, setReimbursable] = useState(false);
  const [reimburseCollaboratorId, setReimburseCollaboratorId] = useState<string | null>(null);

  const { profile } = useProjectsAuth();
  const collaboratorsQ = useCollaboratorsList({ status: "active" });
  const collaborators = collaboratorsQ.data ?? [];

  type ExtraFields = {
    receipt_path?: string | null;
    supplier_nif?: string | null;
    document_number?: string | null;
    amount_ex_vat?: number | null;
    vat_amount?: number | null;
    vat_rate?: number | null;
    payment_source_type?: string | null;
    payment_source_label?: string | null;
    reimbursable?: boolean | null;
    reimburse_collaborator_id?: string | null;
  };

  useEffect(() => {
    if (open) {
      const ex = (initial ?? {}) as ExtraFields;
      setDescription(initial?.description ?? "");
      setCategory((initial?.category ?? "misc") as ExpenseCategory);
      setSupplierId(initial?.supplier_id ?? null);
      setVendor(initial?.vendor ?? "");
      setAmount(initial?.purchase_price != null ? String(initial.purchase_price) : "");
      setIncurredAt(initial?.incurred_at ?? initial?.expense_date ?? "");
      setStatus((initial?.status ?? "draft") as ExpenseStatus);
      setPaidAt(initial?.paid_at ?? "");
      setRebillable(initial?.rebillable ?? false);
      setNotes(initial?.notes ?? "");
      setReceiptPath(ex.receipt_path ?? null);
      setSupplierNif(ex.supplier_nif ?? "");
      setDocumentNumber(ex.document_number ?? "");
      setAmountExVat(ex.amount_ex_vat != null ? String(ex.amount_ex_vat) : "");
      setVatAmount(ex.vat_amount != null ? String(ex.vat_amount) : "");
      setVatRate(ex.vat_rate != null ? String(ex.vat_rate) : "");
      setPaymentSourceType(
        (ex.payment_source_type as PaymentSourceType | undefined) ?? "company_account",
      );
      setPaymentSourceLabel(ex.payment_source_label ?? "");
      setReimbursable(ex.reimbursable ?? false);
      setReimburseCollaboratorId(
        ex.reimburse_collaborator_id ?? profile?.collaborator_id ?? null,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  async function handleReceiptUpload(file: File | null) {
    if (!file) return;
    const folder = profile?.collaborator_id;
    if (!folder) {
      toast.error(t("expenses.fields.receiptNoProfile"));
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${folder}/project-expenses/${projectId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("benefit-receipts")
        .upload(path, file, { upsert: false });
      if (error) throw error;
      setReceiptPath(path);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }


  function handleSupplierChange(id: string | null, supplier: Supplier | null) {
    setSupplierId(id);
    if (supplier) {
      // Mirror into legacy vendor for back-compat with reports/exports.
      setVendor(supplier.name);
    } else if (id === null) {
      setVendor("");
    }
  }

  const parseResult = projectExpenseSchema.safeParse({
    description,
    category,
    amount: Number(amount),
    incurred_at: incurredAt,
    paid_at: paidAt,
    status,
    rebillable,
  });
  const errors = flattenIssues(parseResult);
  const isValid = parseResult.success;
  const errMsg = (key: string) =>
    errors[key] ? t(`expenses.dialog.errors.${errors[key]}`) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      toast.error(t("expenses.dialog.errors.formInvalid"));
      return;
    }
    try {
      const payload = {
        description: description.trim(),
        category,
        supplier_id: supplierId,
        vendor: vendor.trim() || null,
        purchase_price: Number(amount || 0),
        sale_price: 0, // expenses never carry margin
        incurred_at: incurredAt || null,
        expense_date: incurredAt || null,
        status,
        paid_at: paidAt || null,
        rebillable,
        notes: notes.trim() || null,
        receipt_path: receiptPath,
        supplier_nif: supplierNif.trim() || null,
        document_number: documentNumber.trim() || null,
        amount_ex_vat: amountExVat === "" ? null : Number(amountExVat),
        vat_amount: vatAmount === "" ? null : Number(vatAmount),
        vat_rate: vatRate === "" ? null : Number(vatRate),
        payment_source_type: paymentSourceType,
        payment_source_label: paymentSourceLabel.trim() || null,
        // Only a personally paid expense can be reimbursed.
        reimbursable: paymentSourceType === "personal" ? reimbursable : false,
        reimburse_collaborator_id:
          paymentSourceType === "personal" && reimbursable ? reimburseCollaboratorId : null,
        ...(initial?.id ? { id: initial.id } : {}),
      };
      await upsert.mutateAsync(payload as never);
      toast.success(
        initial?.id ? t("expenses.dialog.toast.updated") : t("expenses.dialog.toast.created"),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? t("expenses.dialog.editTitle") : t("expenses.dialog.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ex-desc">{t("expenses.fields.description")}</Label>
              <Input
                id="ex-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("expenses.fields.descriptionPlaceholder")}
                aria-invalid={!!errMsg("description")}
              />
              {errMsg("description") && (
                <p className="text-[11px] text-destructive">{errMsg("description")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-cat">{t("expenses.fields.category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger id="ex-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`expenses.category.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("expenses.fields.supplier")}</Label>
              <SupplierPicker
                value={supplierId}
                legacyName={vendor}
                onChange={handleSupplierChange}
                disabled={upsert.isPending}
              />
              {!supplierId && vendor && (
                <p className="text-[11px] text-muted-foreground">
                  {t("expenses.fields.supplierLegacyHint", { name: vendor })}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-amt">{t("expenses.fields.amount")} (€)</Label>
              <Input
                id="ex-amt"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!!errMsg("amount")}
              />
              {errMsg("amount") && (
                <p className="text-[11px] text-destructive">{errMsg("amount")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-incurred">{t("expenses.fields.incurredAt")}</Label>
              <Input
                id="ex-incurred"
                type="date"
                value={incurredAt}
                onChange={(e) => setIncurredAt(e.target.value)}
                aria-invalid={!!errMsg("incurred_at")}
              />
              {errMsg("incurred_at") && (
                <p className="text-[11px] text-destructive">{errMsg("incurred_at")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-status">{t("expenses.fields.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ExpenseStatus)}>
                <SelectTrigger id="ex-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`expenses.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-paid">{t("expenses.fields.paidAt")}</Label>
              <Input
                id="ex-paid"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                aria-invalid={!!errMsg("paid_at")}
              />
              {errMsg("paid_at") && (
                <p className="text-[11px] text-destructive">{errMsg("paid_at")}</p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="ex-rebill" className="cursor-pointer">
                  {t("expenses.fields.rebillable")}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("expenses.fields.rebillableHint")}
                </p>
              </div>
              <Switch id="ex-rebill" checked={rebillable} onCheckedChange={setRebillable} />
            </div>

            {/* Receipt */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ex-receipt">{t("expenses.fields.receipt")}</Label>
              <Input
                id="ex-receipt"
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={(e) => handleReceiptUpload(e.target.files?.[0] ?? null)}
              />
              {uploading && (
                <p className="text-[11px] text-muted-foreground">
                  {t("expenses.fields.receiptUploading")}
                </p>
              )}
              {receiptPath && !uploading && (
                <p className="text-[11px] text-muted-foreground">
                  {t("expenses.fields.receiptAttached")}
                </p>
              )}
            </div>

            {/* Invoice detail */}
            <div className="space-y-1.5">
              <Label htmlFor="ex-nif">{t("expenses.fields.supplierNif")}</Label>
              <Input
                id="ex-nif"
                value={supplierNif}
                onChange={(e) => setSupplierNif(e.target.value)}
                placeholder="9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-docnum">{t("expenses.fields.documentNumber")}</Label>
              <Input
                id="ex-docnum"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="FT 2026/12345"
              />
            </div>

            {/* VAT detail */}
            <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:col-span-2 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ex-exvat">{t("expenses.fields.amountExVat")} (€)</Label>
                <Input
                  id="ex-exvat"
                  type="number"
                  step="0.01"
                  value={amountExVat}
                  onChange={(e) => setAmountExVat(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-vatamt">{t("expenses.fields.vatAmount")} (€)</Label>
                <Input
                  id="ex-vatamt"
                  type="number"
                  step="0.01"
                  value={vatAmount}
                  onChange={(e) => setVatAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-vatrate">{t("expenses.fields.vatRate")} (%)</Label>
                <Input
                  id="ex-vatrate"
                  type="number"
                  step="0.01"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                />
              </div>
            </div>

            {/* Payment origin */}
            <div className="space-y-1.5">
              <Label htmlFor="ex-paysrc">{t("expenses.fields.paymentSource")}</Label>
              <Select
                value={paymentSourceType}
                onValueChange={(v) => setPaymentSourceType(v as PaymentSourceType)}
              >
                <SelectTrigger id="ex-paysrc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`expenses.paymentSource.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-paylabel">{t("expenses.fields.paymentSourceLabel")}</Label>
              <Input
                id="ex-paylabel"
                value={paymentSourceLabel}
                onChange={(e) => setPaymentSourceLabel(e.target.value)}
              />
            </div>

            {paymentSourceType === "personal" && (
              <>
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 sm:col-span-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="ex-reimb" className="cursor-pointer">
                      {t("expenses.fields.reimbursable")}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t("expenses.fields.reimbursableHint")}
                    </p>
                  </div>
                  <Switch
                    id="ex-reimb"
                    checked={reimbursable}
                    onCheckedChange={setReimbursable}
                  />
                </div>
                {reimbursable && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ex-reimb-who">
                      {t("expenses.fields.reimburseCollaborator")}
                    </Label>
                    <Select
                      value={reimburseCollaboratorId ?? ""}
                      onValueChange={(v) => setReimburseCollaboratorId(v)}
                    >
                      <SelectTrigger id="ex-reimb-who">
                        <SelectValue placeholder={t("expenses.fields.reimburseCollaborator")} />
                      </SelectTrigger>
                      <SelectContent>
                        {collaborators.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ex-notes">{t("expenses.fields.notes")}</Label>
              <Textarea
                id="ex-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("expenses.dialog.cancel")}
            </Button>
            <Button type="submit" disabled={upsert.isPending || !isValid}>
              {initial?.id ? t("expenses.dialog.save") : t("expenses.dialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
