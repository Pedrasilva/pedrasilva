import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateAsset,
  useInventoryCategories,
  useInventoryKits,
  useUpdateAsset,
} from "@/lib/inventory/use-inventory";
import {
  ASSET_STATUSES,
  TRACKING_LEVELS,
  type AssetStatus,
  type InventoryAsset,
  type TrackingLevel,
} from "@/lib/inventory/types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When present the dialog edits that asset instead of creating a new one. */
  asset?: InventoryAsset;
};

type FormState = {
  name: string;
  category_id: string;
  tracking_level: TrackingLevel;
  brand: string;
  model: string;
  serial_number: string;
  description: string;
  status: AssetStatus;
  location: string;
  department: string;
  purchase_date: string;
  purchase_price_ex_vat: string;
  warranty_expiry: string;
  depreciation_years: string;
  replacement_years: string;
  insurance_value: string;
  include_in_insurance_register: boolean;
  kit_id: string;
  notes: string;
};

const empty: FormState = {
  name: "",
  category_id: "",
  tracking_level: "standard",
  brand: "",
  model: "",
  serial_number: "",
  description: "",
  status: "available",
  location: "",
  department: "",
  purchase_date: "",
  purchase_price_ex_vat: "",
  warranty_expiry: "",
  depreciation_years: "4",
  replacement_years: "5",
  insurance_value: "",
  include_in_insurance_register: false,
  kit_id: "",
  notes: "",
};

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export function AssetFormDialog({ open, onOpenChange, asset }: Props) {
  const { t } = useTranslation(["inventory", "common"]);
  const { data: categories = [] } = useInventoryCategories();
  const { data: kits = [] } = useInventoryKits();
  const create = useCreateAsset();
  const update = useUpdateAsset();
  const [form, setForm] = useState<FormState>(empty);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  useEffect(() => {
    if (!open) return;
    if (asset) {
      setForm({
        name: asset.name,
        category_id: asset.category_id,
        tracking_level: asset.tracking_level,
        brand: asset.brand ?? "",
        model: asset.model ?? "",
        serial_number: asset.serial_number ?? "",
        description: asset.description ?? "",
        status: asset.status,
        location: asset.location ?? "",
        department: asset.department ?? "",
        purchase_date: asset.purchase_date ?? "",
        purchase_price_ex_vat: asset.purchase_price_ex_vat?.toString() ?? "",
        warranty_expiry: asset.warranty_expiry ?? "",
        depreciation_years: String(asset.depreciation_years),
        replacement_years: String(asset.replacement_years),
        insurance_value: asset.insurance_value?.toString() ?? "",
        include_in_insurance_register: asset.include_in_insurance_register,
        kit_id: asset.kit_id ?? "",
        notes: asset.notes ?? "",
      });
    } else {
      setForm({ ...empty, category_id: categories[0]?.id ?? "" });
    }
  }, [open, asset, categories]);

  /** Picking a category pre-fills its default lifetimes (still editable). */
  const onCategoryChange = (id: string) => {
    const c = catById.get(id);
    setForm((f) => ({
      ...f,
      category_id: id,
      tracking_level: asset ? f.tracking_level : (c?.default_tracking_level ?? f.tracking_level),
      depreciation_years: asset ? f.depreciation_years : String(c?.default_depreciation_years ?? 4),
      replacement_years: asset ? f.replacement_years : String(c?.default_replacement_years ?? 5),
    }));
  };

  const submit = async () => {
    if (!form.name.trim() || !form.category_id) return;
    const shared = {
      name: form.name.trim(),
      category_id: form.category_id,
      tracking_level: form.tracking_level,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      description: form.description.trim() || null,
      status: form.status,
      location: form.location.trim() || null,
      department: form.department.trim() || null,
      purchase_date: form.purchase_date || null,
      purchase_price_ex_vat: numOrNull(form.purchase_price_ex_vat),
      warranty_expiry: form.warranty_expiry || null,
      depreciation_years: Number(form.depreciation_years) || 4,
      replacement_years: Number(form.replacement_years) || 5,
      insurance_value: numOrNull(form.insurance_value),
      include_in_insurance_register: form.include_in_insurance_register,
      kit_id: form.kit_id || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (asset) {
        await update.mutateAsync({ id: asset.id, patch: shared as Partial<InventoryAsset> });
        toast.success(t("inventory:form.updated"));
      } else {
        await create.mutateAsync({
          ...shared,
          categoryCode: catById.get(form.category_id)?.code ?? "OTH",
          custody_mode: "shared",
        });
        toast.success(t("inventory:form.created"));
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {asset ? t("inventory:form.editTitle") : t("inventory:form.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {asset ? asset.asset_code : t("inventory:form.codeHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t("inventory:asset.name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div>
            <Label>{t("inventory:asset.category")}</Label>
            <Select value={form.category_id} onValueChange={onCategoryChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("inventory:asset.trackingLevel")}</Label>
            <Select
              value={form.tracking_level}
              onValueChange={(v) => setForm({ ...form, tracking_level: v as TrackingLevel })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACKING_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {t(`inventory:tracking.${l}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("inventory:asset.brand")}</Label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div>
            <Label>{t("inventory:asset.model")}</Label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div>
            <Label>{t("inventory:asset.serialNumber")}</Label>
            <Input
              value={form.serial_number}
              onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("inventory:asset.status")}</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as AssetStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`inventory:status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("inventory:asset.location")}</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("inventory:asset.department")}</Label>
            <Input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>

          <div>
            <Label>{t("inventory:asset.purchaseDate")}</Label>
            <Input
              type="date"
              value={form.purchase_date}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("inventory:asset.purchasePriceEx")}</Label>
            <Input
              type="number"
              step="0.01"
              value={form.purchase_price_ex_vat}
              onChange={(e) => setForm({ ...form, purchase_price_ex_vat: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("inventory:asset.warrantyExpiry")}</Label>
            <Input
              type="date"
              value={form.warranty_expiry}
              onChange={(e) => setForm({ ...form, warranty_expiry: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("inventory:asset.insuranceValue")}</Label>
            <Input
              type="number"
              step="0.01"
              value={form.insurance_value}
              onChange={(e) => setForm({ ...form, insurance_value: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("inventory:asset.depreciationYears")}</Label>
            <Input
              type="number"
              value={form.depreciation_years}
              onChange={(e) => setForm({ ...form, depreciation_years: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("inventory:asset.replacementYears")}</Label>
            <Input
              type="number"
              value={form.replacement_years}
              onChange={(e) => setForm({ ...form, replacement_years: e.target.value })}
            />
          </div>

          <div>
            <Label>{t("inventory:asset.kit")}</Label>
            <Select
              value={form.kit_id || "none"}
              onValueChange={(v) => setForm({ ...form, kit_id: v === "none" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {kits.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 pb-1">
            <Switch
              id="insurance"
              checked={form.include_in_insurance_register}
              onCheckedChange={(v) => setForm({ ...form, include_in_insurance_register: v })}
            />
            <Label htmlFor="insurance" className="text-sm">
              {t("inventory:asset.includeInsurance")}
            </Label>
          </div>

          <div className="sm:col-span-2">
            <Label>{t("inventory:asset.notes")}</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !form.name.trim() || !form.category_id}>
            {t("inventory:form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
