import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { CategorySelect } from "./category-select";
import { ImageField } from "./image-field";
import type { LibraryProduct } from "@/lib/products/types";
import { useSaveLibraryProduct } from "@/lib/products/use-products";

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
  const [draft, setDraft] = useState<ProductDraft>(EMPTY);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const save = useSaveLibraryProduct();
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
      toast.error("Product name is required");
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
        toast.success(product ? "Product updated" : "Product added to the library");
      } else {
        const saved = saveToLibrary ? await save.mutateAsync(payload) : null;
        await onCreated?.(draft, saved);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the product");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "library"
              ? product
                ? "Edit library product"
                : "New library product"
              : "Create new product"}
          </DialogTitle>
          <DialogDescription>
            Reusable product knowledge. Project-specific details (reference, location, quantity)
            are set on the project item.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name *">
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </Field>
            <Field label="Category">
              <CategorySelect value={draft.category_id} onChange={(v) => set("category_id", v)} />
            </Field>
            <Field label="Manufacturer">
              <Input
                value={draft.manufacturer}
                onChange={(e) => set("manufacturer", e.target.value)}
              />
            </Field>
            <Field label="Designer">
              <Input value={draft.designer} onChange={(e) => set("designer", e.target.value)} />
            </Field>
            <Field label="Ref. code">
              <Input value={draft.ref_code} onChange={(e) => set("ref_code", e.target.value)} />
            </Field>
            <Field label="Dimensions">
              <Input
                value={draft.dimensions}
                placeholder="W × D × H"
                onChange={(e) => set("dimensions", e.target.value)}
              />
            </Field>
            <Field label="Weight">
              <Input
                value={draft.weight}
                placeholder="e.g. 12 kg"
                onChange={(e) => set("weight", e.target.value)}
              />
            </Field>
            <Field label="Indicative unit price">
              <Input
                type="number"
                step="0.01"
                value={draft.indicative_unit_price}
                onChange={(e) => set("indicative_unit_price", e.target.value)}
              />
            </Field>
            <Field label="Price last updated">
              <Input
                type="date"
                value={draft.price_last_updated}
                onChange={(e) => set("price_last_updated", e.target.value)}
              />
            </Field>
            <Field label="Product URL">
              <Input
                value={draft.product_url}
                placeholder="https://"
                onChange={(e) => set("product_url", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Material / specification">
                <Textarea
                  rows={4}
                  value={draft.material_spec}
                  onChange={(e) => set("material_spec", e.target.value)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notes">
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
              label="Primary image"
              value={draft.primary_image_path}
              onChange={(v) => set("primary_image_path", v)}
              size="large"
            />
            <ImageField
              label="Finish / sample image"
              value={draft.finish_image_path}
              onChange={(v) => set("finish_image_path", v)}
              size="medium"
            />
            <ImageField
              label="Samples (image or PDF)"
              value={draft.sample_pdf_path}
              onChange={(v) => set("sample_pdf_path", v)}
              size="medium"
              allowPdf
            />
          </div>
        </div>

        {mode === "project" && (
          <label className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <Checkbox
              checked={saveToLibrary}
              onCheckedChange={(v) => setSaveToLibrary(v === true)}
            />
            Save this product to the PSA Library
          </label>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {mode === "library" ? "Save product" : "Add to project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
