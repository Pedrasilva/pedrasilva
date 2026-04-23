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
  EXTERNAL_SERVICE_STATUSES,
  useUpsertExternalService,
  type ExternalService,
  type ExternalServiceStatus,
  type MarkupType,
} from "@/lib/projects/use-external-services";
import {
  externalServiceSchema,
  flattenIssues,
} from "@/lib/projects/financial-validation";
import { SupplierPicker } from "./supplier-picker";
import type { Supplier } from "@/lib/projects/use-suppliers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  initial?: (ExternalService & { supplier_id?: string | null }) | null;
}

export function ExternalServiceDialog({
  open,
  onOpenChange,
  projectId,
  initial,
}: Props) {
  const { t } = useTranslation("projects");
  const upsert = useUpsertExternalService(projectId);

  const [description, setDescription] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  // Legacy free-text — only kept for old rows; new entries should use supplier_id.
  const [legacySupplierName, setLegacySupplierName] = useState<string>("");
  const [legacySupplierContact, setLegacySupplierContact] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [markupType, setMarkupType] = useState<MarkupType>("percent");
  const [markupValue, setMarkupValue] = useState(0);
  const [salePriceManual, setSalePriceManual] = useState(false);
  const [manualSalePrice, setManualSalePrice] = useState(0);
  const [status, setStatus] = useState<ExternalServiceStatus>("draft");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDescription(initial?.description ?? "");
      setSupplierId(initial?.supplier_id ?? null);
      setLegacySupplierName(initial?.supplier_name ?? "");
      setLegacySupplierContact(initial?.supplier_contact ?? "");
      setQuantity(Number(initial?.quantity ?? 1));
      setUnitCost(Number(initial?.unit_cost ?? initial?.purchase_price ?? 0));
      setMarkupType((initial?.markup_type ?? "percent") as MarkupType);
      setMarkupValue(Number(initial?.markup_value ?? 0));
      setSalePriceManual(initial?.sale_price_manual ?? false);
      setManualSalePrice(Number(initial?.sale_price ?? 0));
      setStatus((initial?.status ?? "draft") as ExternalServiceStatus);
      setInvoiceReference(initial?.invoice_reference ?? "");
      setInvoiceDate(initial?.invoice_date ?? "");
      setDueDate(initial?.due_date ?? "");
      setPaidAt(initial?.paid_at ?? "");
      setNotes(initial?.notes ?? "");
    }
  }, [open, initial]);

  function handleSupplierChange(id: string | null, supplier: Supplier | null) {
    setSupplierId(id);
    if (supplier) {
      // Mirror the chosen supplier into legacy fields so older readers
      // (reports, exports) keep working. The linked id remains canonical.
      setLegacySupplierName(supplier.name);
      setLegacySupplierContact(supplier.email ?? supplier.phone ?? "");
    } else if (id === null) {
      // Clearing a linked supplier — drop the legacy mirror too so we don't
      // leave a stale name behind. Manual edits still possible after.
      setLegacySupplierName("");
      setLegacySupplierContact("");
    }
  }

  // Live preview of computed sale price
  const totalCost = Number(unitCost) * Number(quantity || 1);
  const computedSalePrice =
    markupType === "percent"
      ? totalCost * (1 + Number(markupValue || 0) / 100)
      : totalCost + Number(markupValue || 0);
  const previewSalePerUnit = salePriceManual
    ? Number(manualSalePrice)
    : (quantity || 1) > 0
      ? computedSalePrice / (quantity || 1)
      : 0;
  const previewRevenue = previewSalePerUnit * (quantity || 1);
  const previewMargin = previewRevenue - totalCost;

  // Live validation — recomputed every render. Cheap; small object.
  const parseResult = externalServiceSchema.safeParse({
    description,
    quantity: Number(quantity),
    unit_cost: Number(unitCost),
    markup_type: markupType,
    markup_value: Number(markupValue),
    sale_price_manual: salePriceManual,
    manual_sale_price: Number(manualSalePrice),
    status,
    invoice_date: invoiceDate,
    due_date: dueDate,
    paid_at: paidAt,
  });
  const errors = flattenIssues(parseResult);
  const isValid = parseResult.success;
  const errMsg = (key: string) =>
    errors[key] ? t(`externalServices.dialog.errors.${errors[key]}`) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      toast.error(t("externalServices.dialog.errors.formInvalid"));
      return;
    }
    try {
      const payload = {
        description: description.trim(),
        supplier_id: supplierId,
        supplier_name: legacySupplierName.trim() || null,
        supplier_contact: legacySupplierContact.trim() || null,
        quantity: Number(quantity || 1),
        unit_cost: Number(unitCost || 0),
        purchase_price: Number(unitCost || 0),
        markup_type: markupType,
        markup_value: Number(markupValue || 0),
        sale_price_manual: salePriceManual,
        sale_price: salePriceManual ? Number(manualSalePrice) : 0, // trigger overrides if not manual
        status,
        invoice_reference: invoiceReference.trim() || null,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        paid_at: paidAt || null,
        notes: notes.trim() || null,
        ...(initial?.id ? { id: initial.id } : {}),
      };
      await upsert.mutateAsync(payload as never);
      toast.success(
        initial?.id
          ? t("externalServices.dialog.toast.updated")
          : t("externalServices.dialog.toast.created"),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial?.id
              ? t("externalServices.dialog.editTitle")
              : t("externalServices.dialog.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="es-desc">{t("externalServices.fields.description")}</Label>
              <Input
                id="es-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("externalServices.fields.descriptionPlaceholder")}
                aria-invalid={!!errMsg("description")}
              />
              {errMsg("description") && (
                <p className="text-[11px] text-destructive">{errMsg("description")}</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("externalServices.fields.supplier")}</Label>
              <SupplierPicker
                value={supplierId}
                legacyName={legacySupplierName}
                onChange={handleSupplierChange}
                disabled={upsert.isPending}
              />
              {!supplierId && legacySupplierName && (
                <p className="text-[11px] text-muted-foreground">
                  {t("externalServices.fields.supplierLegacyHint", {
                    name: legacySupplierName,
                  })}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-qty">{t("externalServices.fields.quantity")}</Label>
              <Input
                id="es-qty"
                type="number"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                aria-invalid={!!errMsg("quantity")}
              />
              {errMsg("quantity") && (
                <p className="text-[11px] text-destructive">{errMsg("quantity")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-unit">{t("externalServices.fields.unitCost")} (€)</Label>
              <Input
                id="es-unit"
                type="number"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(Number(e.target.value))}
                aria-invalid={!!errMsg("unit_cost")}
              />
              {errMsg("unit_cost") && (
                <p className="text-[11px] text-destructive">{errMsg("unit_cost")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-mtype">{t("externalServices.fields.markupType")}</Label>
              <Select value={markupType} onValueChange={(v) => setMarkupType(v as MarkupType)}>
                <SelectTrigger id="es-mtype">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t("externalServices.markup.percent")}</SelectItem>
                  <SelectItem value="fixed">{t("externalServices.markup.fixed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-mval">
                {t("externalServices.fields.markupValue")} {markupType === "percent" ? "(%)" : "(€)"}
              </Label>
              <Input
                id="es-mval"
                type="number"
                step="0.01"
                value={markupValue}
                onChange={(e) => setMarkupValue(Number(e.target.value))}
                disabled={salePriceManual}
                aria-invalid={!!errMsg("markup_value")}
              />
              {errMsg("markup_value") && (
                <p className="text-[11px] text-destructive">{errMsg("markup_value")}</p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="es-manual" className="cursor-pointer">
                  {t("externalServices.fields.salePriceManual")}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("externalServices.fields.salePriceManualHint")}
                </p>
              </div>
              <Switch
                id="es-manual"
                checked={salePriceManual}
                onCheckedChange={setSalePriceManual}
              />
            </div>
            {salePriceManual && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="es-sale">{t("externalServices.fields.salePrice")} (€)</Label>
                <Input
                  id="es-sale"
                  type="number"
                  step="0.01"
                  value={manualSalePrice}
                  onChange={(e) => setManualSalePrice(Number(e.target.value))}
                  aria-invalid={!!errMsg("manual_sale_price")}
                />
                {errMsg("manual_sale_price") && (
                  <p className="text-[11px] text-destructive">{errMsg("manual_sale_price")}</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="es-status">{t("externalServices.fields.status")}</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ExternalServiceStatus)}
              >
                <SelectTrigger id="es-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXTERNAL_SERVICE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`externalServices.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-invref">{t("externalServices.fields.invoiceReference")}</Label>
              <Input
                id="es-invref"
                value={invoiceReference}
                onChange={(e) => setInvoiceReference(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-invdate">{t("externalServices.fields.invoiceDate")}</Label>
              <Input
                id="es-invdate"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                aria-invalid={!!errMsg("invoice_date")}
              />
              {errMsg("invoice_date") && (
                <p className="text-[11px] text-destructive">{errMsg("invoice_date")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-due">{t("externalServices.fields.dueDate")}</Label>
              <Input
                id="es-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-invalid={!!errMsg("due_date")}
              />
              {errMsg("due_date") && (
                <p className="text-[11px] text-destructive">{errMsg("due_date")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-paid">{t("externalServices.fields.paidAt")}</Label>
              <Input
                id="es-paid"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                aria-invalid={!!errMsg("paid_at")}
              />
              {errMsg("paid_at") && (
                <p className="text-[11px] text-destructive">{errMsg("paid_at")}</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="es-notes">{t("externalServices.fields.notes")}</Label>
              <Textarea
                id="es-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label={t("externalServices.preview.cost")} value={totalCost} />
              <Stat label={t("externalServices.preview.revenue")} value={previewRevenue} />
              <Stat
                label={t("externalServices.preview.margin")}
                value={previewMargin}
                tone={previewMargin >= 0 ? "ok" : "bad"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("externalServices.dialog.cancel")}
            </Button>
            <Button type="submit" disabled={upsert.isPending || !isValid}>
              {initial?.id
                ? t("externalServices.dialog.save")
                : t("externalServices.dialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "bad";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${color}`}>
        {new Intl.NumberFormat("pt-PT", {
          style: "currency",
          currency: "EUR",
        }).format(value)}
      </div>
    </div>
  );
}
