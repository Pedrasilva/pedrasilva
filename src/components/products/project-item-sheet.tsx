import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { formatMoney, itemTotal, type ProjectItem } from "@/lib/products/types";

type Draft = Record<string, string | null>;

const TEXT_FIELDS = [
  "reference",
  "location",
  "name",
  "manufacturer",
  "designer",
  "material_spec",
  "dimensions",
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
  const update = useUpdateProjectItem();
  const pushToLibrary = useUpdateLibraryFromItem();
  const [draft, setDraft] = useState<Draft>({});
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [images, setImages] = useState<{ primary: string | null; finish: string | null }>({
    primary: null,
    finish: null,
  });

  useEffect(() => {
    if (!item) return;
    const d: Draft = {};
    for (const f of TEXT_FIELDS) d[f] = (item[f] as string | null) ?? "";
    setDraft(d);
    setQty(String(item.quantity ?? 1));
    setPrice(item.unit_price == null ? "" : String(item.unit_price));
    setCategoryId(item.category_id);
    setImages({ primary: item.primary_image_path, finish: item.finish_image_path });
  }, [item]);

  if (!item) return null;

  const set = (k: string, v: string | null) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const patch: Partial<ProjectItem> = {
      category_id: categoryId,
      quantity: Number(qty) || 0,
      unit_price: price === "" ? null : Number(price),
      primary_image_path: images.primary,
      finish_image_path: images.finish,
    };
    for (const f of TEXT_FIELDS) {
      (patch as Record<string, unknown>)[f] = (draft[f] ?? "").toString().trim() || null;
    }
    if (!patch.name) {
      toast.error("Item name is required");
      return;
    }
    try {
      await update.mutateAsync({ id: item.id, projectId, patch });
      toast.success("Item saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the item");
    }
  };

  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{item.name}</SheetTitle>
          <SheetDescription>
            Project-specific record. Editing it never changes the library product.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <F label="Reference / Plan ID">
            <Input value={draft.reference ?? ""} onChange={(e) => set("reference", e.target.value)} />
          </F>
          <F label="Location">
            <Input value={draft.location ?? ""} onChange={(e) => set("location", e.target.value)} />
          </F>
          <F label="Item name *">
            <Input value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </F>
          <F label="Category">
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </F>
          <F label="Manufacturer">
            <Input
              value={draft.manufacturer ?? ""}
              onChange={(e) => set("manufacturer", e.target.value)}
            />
          </F>
          <F label="Designer">
            <Input value={draft.designer ?? ""} onChange={(e) => set("designer", e.target.value)} />
          </F>
          <F label="Dimensions">
            <Input
              value={draft.dimensions ?? ""}
              onChange={(e) => set("dimensions", e.target.value)}
            />
          </F>
          <F label="Selected finish / colour">
            <Input
              value={draft.selected_finish ?? ""}
              onChange={(e) => set("selected_finish", e.target.value)}
            />
          </F>
          <div className="sm:col-span-2">
            <F label="Material / specification">
              <Textarea
                rows={2}
                value={draft.material_spec ?? ""}
                onChange={(e) => set("material_spec", e.target.value)}
              />
            </F>
          </div>
          <F label="Quantity">
            <Input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </F>
          <F label="Unit price">
            <Input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </F>
          <div className="sm:col-span-2 text-sm text-muted-foreground">
            Total:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatMoney(
                (Number(qty) || 0) * (price === "" ? 0 : Number(price) || 0),
                item.currency,
              )}
            </span>{" "}
            <span className="text-xs">(currently {formatMoney(itemTotal(item), item.currency)})</span>
          </div>
          <div className="sm:col-span-2">
            <F label="Product URL">
              <Input
                value={draft.product_url ?? ""}
                onChange={(e) => set("product_url", e.target.value)}
              />
            </F>
          </div>
          <ImageField
            label="Main image"
            value={images.primary}
            onChange={(v) => setImages((s) => ({ ...s, primary: v }))}
          />
          <ImageField
            label="Finish / sample image"
            value={images.finish}
            onChange={(v) => setImages((s) => ({ ...s, finish: v }))}
          />
          <div className="sm:col-span-2">
            <F label="Notes">
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
            Save item
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {item.source_library_product_id && (
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => {
                if (!confirm("Overwrite the library product with this item's data?")) return;
                pushToLibrary
                  .mutateAsync(item)
                  .then(() => toast.success("Library product updated"))
                  .catch((e) => toast.error(String(e)));
              }}
            >
              Update library product from this item
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
