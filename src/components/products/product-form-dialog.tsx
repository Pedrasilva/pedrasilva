import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { useEffect, useState } from "react";
import { toast } from '@/lib/toast';
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
import { Checkbox } from "@/components/ui/checkbox";
import { CategorySelect } from "./category-select";
import { ImageField } from "./image-field";
import type { LibraryProduct } from "@/lib/products/types";
import { useSaveLibraryProduct } from "@/lib/products/use-products";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";

export type ProductDraft = {
  name: string;
  category_id: string | null;
  manufacturer: string;
  designer: string;
  material_spec: string;
  dimensions: string;
  weight: string;
  ref_code: string;
  indicative_unit_price: string;
  price_last_updated: string;
  product_url: string;
  primary_image_path: string | null;
  finish_image_path: string | null;
  sample_pdf_path: string | null;
  notes: string;
};

const EMPTY: ProductDraft = {
  name: "",
  category_id: null,
  manufacturer: "",
  designer: "",
  material_spec: "",
  dimensions: "",
  weight: "",
  ref_code: "",
  indicative_unit_price: "",
  price_last_updated: "",
  product_url: "",
  primary_image_path: null,
  finish_image_path: null,
  sample_pdf_path: null,
  notes: "",
};

/**
 * One compact form used for two jobs:
 *  - editing a Library Product (`mode="library"`)
 *  - creating a brand-new product while specifying a project
 *    (`mode="project"`, with the optional "save to library" checkbox).
 */
export function ProductFormDialog({
  open,
  onOpenChange,
  mode,
  product,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "library" | "project";
  product?: LibraryProduct | null;
  /** project mode: receives the draft plus the resulting library product (if saved). */
  onCreated?: (draft: ProductDraft, saved: LibraryProduct | null) => void | Promise<void>;
}) {
  useTranslation();
  const [draft, setDraft] = useState<ProductDraft>(EMPTY);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const save = useSaveLibraryProduct();
  const canEditLibrary = useMyPermissionsV2().can("products.edit", "all");
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setDraft(
      product
        ? {
            name: product.name,
            category_id: product.category_id,
            manufacturer: product.manufacturer ?? "",
            designer: product.designer ?? "",
            material_spec: product.material_spec ?? "",
            dimensions: product.dimensions ?? "",
            weight: product.weight ?? "",
            ref_code: product.ref_code ?? "",
            indicative_unit_price:
              product.indicative_unit_price == null ? "" : String(product.indicative_unit_price),
            price_last_updated: product.price_last_updated ?? "",
            product_url: product.product_url ?? "",
            primary_image_path: product.primary_image_path,
            finish_image_path: product.finish_image_path,
            sample_pdf_path: product.sample_pdf_path ?? null,
            notes: product.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, product]);

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error(uiI18n.t("crm:products.nameRequired"));
      return;
    }
    const payload = {
      name: draft.name.trim(),
      category_id: draft.category_id,
      manufacturer: draft.manufacturer || null,
      designer: draft.designer || null,
      material_spec: draft.material_spec || null,
      dimensions: draft.dimensions || null,
      weight: draft.weight || null,
      ref_code: draft.ref_code || null,
      indicative_unit_price: draft.indicative_unit_price
        ? Number(draft.indicative_unit_price)
        : null,
      price_last_updated: draft.price_last_updated || null,
      product_url: draft.product_url || null,
      primary_image_path: draft.primary_image_path,
      finish_image_path: draft.finish_image_path,
      sample_pdf_path: draft.sample_pdf_path,
      notes: draft.notes || null,
    };

    try {
      if (mode === "library") {
        await save.mutateAsync({ ...payload, id: product?.id });
        toast.success(product ? uiI18n.t("crm:products.updated") : uiI18n.t("crm:products.addedToLibrary"));
      } else {
        const saved = saveToLibrary && canEditLibrary ? await save.mutateAsync(payload) : null;
        await onCreated?.(draft, saved);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : uiI18n.t("crm:products.saveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "library"
              ? product
                ? uiI18n.t("crm:products.editLibrary")
                : uiI18n.t("crm:products.newLibrary")
              : uiI18n.t("crm:products.createNew")}
          </DialogTitle>
          <DialogDescription>
             {uiI18n.t("crm:products.libraryRecordSub")} </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={uiI18n.t("crm:products.nameRequiredLabel")}>
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </Field>
            <Field label={uiI18n.t("common:category")}>
              <CategorySelect value={draft.category_id} onChange={(v) => set("category_id", v)} />
            </Field>
            <Field label={uiI18n.t("common:manufacturer")}>
              <Input
                value={draft.manufacturer}
                onChange={(e) => set("manufacturer", e.target.value)}
              />
            </Field>
            <Field label={uiI18n.t("common:designer")}>
              <Input value={draft.designer} onChange={(e) => set("designer", e.target.value)} />
            </Field>
            <Field label={uiI18n.t("crm:products.refCode")}>
              <Input value={draft.ref_code} onChange={(e) => set("ref_code", e.target.value)} />
            </Field>
            <Field label={uiI18n.t("common:dimensions")}>
              <Input
                value={draft.dimensions}
                placeholder={uiI18n.t("crm:products.dimensionsHint")}
                onChange={(e) => set("dimensions", e.target.value)}
              />
            </Field>
            <Field label={uiI18n.t("common:weight")}>
              <Input
                value={draft.weight}
                placeholder={uiI18n.t("crm:products.weightHint")}
                onChange={(e) => set("weight", e.target.value)}
              />
            </Field>
            <Field label={uiI18n.t("crm:products.indicativePrice")}>
              <Input
                type="number"
                step="0.01"
                value={draft.indicative_unit_price}
                onChange={(e) => set("indicative_unit_price", e.target.value)}
              />
            </Field>
            <Field label={uiI18n.t("crm:products.priceUpdated")}>
              <Input
                type="date"
                value={draft.price_last_updated}
                onChange={(e) => set("price_last_updated", e.target.value)}
              />
            </Field>
            <Field label={uiI18n.t("crm:products.productUrl")}>
              <Input
                value={draft.product_url}
                placeholder={uiI18n.t("common:urlHint")}
                onChange={(e) => set("product_url", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={uiI18n.t("crm:products.materialSpecification")}>
                <Textarea
                  rows={4}
                  value={draft.material_spec}
                  onChange={(e) => set("material_spec", e.target.value)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={uiI18n.t("common:notes")}>
                <Textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="space-y-4">
            <ImageField
              label={uiI18n.t("crm:products.primaryImage")}
              value={draft.primary_image_path}
              onChange={(v) => set("primary_image_path", v)}
              size="large"
            />
            <ImageField
              label={uiI18n.t("crm:products.finishImage")}
              value={draft.finish_image_path}
              onChange={(v) => set("finish_image_path", v)}
              size="medium"
            />
            <ImageField
              label={uiI18n.t("crm:products.samples")}
              value={draft.sample_pdf_path}
              onChange={(v) => set("sample_pdf_path", v)}
              size="medium"
              allowPdf
            />
          </div>
        </div>

        {mode === "project" && canEditLibrary && (
          <label className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <Checkbox
              checked={saveToLibrary}
              onCheckedChange={(v) => setSaveToLibrary(v === true)}
            />
             {uiI18n.t("crm:products.saveToLibrary")} </label>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
             {uiI18n.t("common:cancel")} </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {mode === "library" ? uiI18n.t("crm:products.saveProduct") : uiI18n.t("crm:products.addToProject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  useTranslation();
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
