import { translateError } from '@/lib/translate-error';
import { formatMoney } from "@/lib/product-ui-format";
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { useEffect, useState } from "react";
import { toast } from '@/lib/toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategorySelect } from "./category-select";
import { ImageField } from "./image-field";
import {
  useUpdateLibraryFromItem,
  useUpdateProjectItem,
} from "@/lib/products/use-products";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import {
  APPROVAL_STATUSES,
  
  itemTotal,
  type ProductApprovalStatus,
  type ProjectItem} from "@/lib/products/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Draft = Record<string, string | null>;

const TEXT_FIELDS = [
  "reference",
  "ref_code",
  "location",
  "name",
  "manufacturer",
  "designer",
  "material_spec",
  "dimensions",
  "weight",
  "selected_finish",
  "product_url",
  "notes",
] as const;

/** Full edit surface for a single project item (snapshot — never the library). */
export function ProjectItemSheet({
  item,
  projectId,
  onOpenChange,
}: {
  item: ProjectItem | null;
  projectId: string;
  onOpenChange: (open: boolean) => void;
}) {
  useTranslation();
  const update = useUpdateProjectItem();
  const pushToLibrary = useUpdateLibraryFromItem();
  const canEditLibrary = useMyPermissionsV2().can("products.edit", "all");
  const [draft, setDraft] = useState<Draft>({});
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [approval, setApproval] = useState<ProductApprovalStatus>("proposed");
  const [images, setImages] = useState<{
    primary: string | null;
    finish: string | null;
    sample: string | null;
  }>({ primary: null, finish: null, sample: null });

  useEffect(() => {
    if (!item) return;
    const d: Draft = {};
    for (const f of TEXT_FIELDS) d[f] = (item[f] as string | null) ?? "";
    setDraft(d);
    setQty(String(item.quantity ?? 1));
    setPrice(item.unit_price == null ? "" : String(item.unit_price));
    setCategoryId(item.category_id);
    setApproval((item.approval_status as ProductApprovalStatus) ?? "proposed");
    setImages({
      primary: item.primary_image_path,
      finish: item.finish_image_path,
      sample: item.sample_pdf_path ?? null,
    });
  }, [item]);

  if (!item) return null;

  const set = (k: string, v: string | null) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const patch: Partial<ProjectItem> = {
      category_id: categoryId,
      approval_status: approval,
      quantity: Number(qty) || 0,
      unit_price: price === "" ? null : Number(price),
      primary_image_path: images.primary,
      finish_image_path: images.finish,
      sample_pdf_path: images.sample,
    };
    for (const f of TEXT_FIELDS) {
      (patch as Record<string, unknown>)[f] = (draft[f] ?? "").toString().trim() || null;
    }
    if (!patch.name) {
      toast.error(uiI18n.t("crm:products.itemNameRequired"));
      return;
    }
    try {
      await update.mutateAsync({ id: item.id, projectId, patch });
      toast.success(uiI18n.t("crm:products.itemSaved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? translateError(e.message) : uiI18n.t("crm:products.itemSaveFailed"));
    }
  };

  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{item.name}</SheetTitle>
          <SheetDescription>
             {uiI18n.t("crm:products.projectRecordSub")} </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <F label={uiI18n.t("crm:products.referencePlanId")}>
            <Input value={draft.reference ?? ""} onChange={(e) => set("reference", e.target.value)} />
          </F>
          <F label={uiI18n.t("crm:products.refCode")}>
            <Input value={draft.ref_code ?? ""} onChange={(e) => set("ref_code", e.target.value)} />
          </F>
          <F label={uiI18n.t("common:location")}>
            <Input value={draft.location ?? ""} onChange={(e) => set("location", e.target.value)} />
          </F>
          <F label={uiI18n.t("crm:products.itemNameRequiredLabel")}>
            <Input value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </F>
          <F label={uiI18n.t("common:category")}>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </F>
          <F label={uiI18n.t("common:manufacturer")}>
            <Input
              value={draft.manufacturer ?? ""}
              onChange={(e) => set("manufacturer", e.target.value)}
            />
          </F>
          <F label={uiI18n.t("common:designer")}>
            <Input value={draft.designer ?? ""} onChange={(e) => set("designer", e.target.value)} />
          </F>
          <F label={uiI18n.t("common:dimensions")}>
            <Input
              value={draft.dimensions ?? ""}
              onChange={(e) => set("dimensions", e.target.value)}
            />
          </F>
          <F label={uiI18n.t("common:weight")}>
            <Input value={draft.weight ?? ""} onChange={(e) => set("weight", e.target.value)} />
          </F>
          <F label={uiI18n.t("crm:products.selectedFinish")}>
            <Input
              value={draft.selected_finish ?? ""}
              onChange={(e) => set("selected_finish", e.target.value)}
            />
          </F>
          <div className="sm:col-span-2">
            <F label={uiI18n.t("crm:products.materialSpecification")}>
              <Textarea
                rows={2}
                value={draft.material_spec ?? ""}
                onChange={(e) => set("material_spec", e.target.value)}
              />
            </F>
          </div>
          <F label={uiI18n.t("crm:products.clientApproval")}>
            <Select value={approval} onValueChange={(v) => setApproval(v as ProductApprovalStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPROVAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {uiI18n.t(`crm:products.approval.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label={uiI18n.t("common:quantity")}>
            <Input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </F>
          <F label={uiI18n.t("common:unitPrice")}>
            <Input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </F>
          <div className="sm:col-span-2 text-sm text-muted-foreground">
             {uiI18n.t("common:totalPrefix")} {" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatMoney(
                (Number(qty) || 0) * (price === "" ? 0 : Number(price) || 0),
                item.currency,
              )}
            </span>{" "}
            <span className="text-xs"> {uiI18n.t("crm:products.currentTotal", { total: formatMoney(itemTotal(item), item.currency) })}</span>
          </div>
          <div className="sm:col-span-2">
            <F label={uiI18n.t("crm:products.productUrl")}>
              <Input
                value={draft.product_url ?? ""}
                onChange={(e) => set("product_url", e.target.value)}
              />
            </F>
          </div>
          <ImageField
            label={uiI18n.t("crm:products.mainImage")}
            value={images.primary}
            onChange={(v) => setImages((s) => ({ ...s, primary: v }))}
          />
          <ImageField
            label={uiI18n.t("crm:products.finishImage")}
            value={images.finish}
            onChange={(v) => setImages((s) => ({ ...s, finish: v }))}
          />
          <ImageField
            label={uiI18n.t("crm:products.samples")}
            value={images.sample}
            onChange={(v) => setImages((s) => ({ ...s, sample: v }))}
            allowPdf
          />

          <div className="sm:col-span-2">
            <F label={uiI18n.t("common:notes")}>
              <Textarea
                rows={3}
                value={draft.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </F>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={update.isPending}>
             {uiI18n.t("crm:products.saveItem")} </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
             {uiI18n.t("common:cancel")} </Button>
          {item.source_library_product_id && canEditLibrary && (
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => {
                if (!confirm(uiI18n.t("crm:products.overwritePrompt"))) return;
                pushToLibrary
                  .mutateAsync(item)
                  .then(() => toast.success(uiI18n.t("crm:products.libraryUpdated")))
                  .catch((e) => toast.error(String(e)));
              }}
            >
               {uiI18n.t("crm:products.updateFromItem")} </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  useTranslation();
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
