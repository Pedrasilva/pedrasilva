import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CategorySelect } from "./category-select";
import { ProductImage } from "./product-image";
import { ProductFormDialog } from "./product-form-dialog";
import {
  useLibraryProducts,
  useProductCategories,
  useSetLibraryProductStatus,
} from "@/lib/products/use-products";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { categoryPath, formatMoney, type LibraryProduct } from "@/lib/products/types";

/**
 * Visual catalogue of the PSA library. Used both as a standalone page and
 * inside the "Browse library" dialog of a project workspace.
 */
export function LibraryBrowser({
  onSelect,
  selectLabel = "Add to project",
  compact,
}: {
  onSelect?: (product: LibraryProduct) => void;
  selectLabel?: string;
  compact?: boolean;
}) {
  useTranslation();
  const { data: products = [], isLoading } = useLibraryProducts();
  const { data: categories = [] } = useProductCategories();
  const setStatus = useSetLibraryProductStatus();
  const canEdit = useMyPermissionsV2().can("products.edit", "all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<LibraryProduct | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const descendants = useMemo(() => {
    if (!category) return null;
    const set = new Set([category]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categories) {
        if (c.parent_id && set.has(c.parent_id) && !set.has(c.id)) {
          set.add(c.id);
          grew = true;
        }
      }
    }
    return set;
  }, [category, categories]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (!showArchived && p.status === "archived") return false;
      if (descendants && !(p.category_id && descendants.has(p.category_id))) return false;
      if (!needle) return true;
      return [p.name, p.manufacturer, p.designer]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle));
    });
  }, [products, q, descendants, showArchived]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={uiI18n.t("crm:products.librarySearch")}
            className="pl-8"
          />
        </div>
        <CategorySelect
          value={category}
          onChange={setCategory}
          includeAll
          placeholder={uiI18n.t("common:allCategories")}
          className="w-[200px]"
        />
        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? uiI18n.t("crm:products.showingArchived") : uiI18n.t("crm:products.currentOnly")}
        </Button>
        {!compact && canEdit && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
             {uiI18n.t("crm:products.newProduct")} </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground"> {uiI18n.t("crm:products.loadingLibrary")} </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
           {uiI18n.t("crm:products.libraryEmpty")} </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <Card key={p.id} className="flex flex-col overflow-hidden">
              <ProductImage
                path={p.primary_image_path}
                alt={p.name}
                className="h-36 w-full rounded-none border-0 border-b"
                width={480}
              />
              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{p.name}</p>
                  {p.status === "archived" && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                       {uiI18n.t("common:archived")} </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[p.manufacturer, p.designer].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {categoryPath(p.category_id, catMap)}
                </p>
                <p className="mt-1 text-sm">
                  {formatMoney(p.indicative_unit_price, p.currency) || "—"}
                  {p.price_last_updated && (
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      ({p.price_last_updated})
                    </span>
                  )}
                </p>
                <div className="mt-auto flex items-center gap-1 pt-2">
                  {onSelect && (
                    <Button size="sm" className="flex-1" onClick={() => onSelect(p)}>
                      {selectLabel}
                    </Button>
                  )}
                  {canEdit && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={uiI18n.t("common:edit")}
                        onClick={() => {
                          setEditing(p);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={p.status === "archived" ? uiI18n.t("common:restore") : uiI18n.t("common:archive")}
                        onClick={() =>
                          setStatus.mutate({
                            id: p.id,
                            status: p.status === "archived" ? "current" : "archived",
                          })
                        }
                      >
                        {p.status === "archived" ? (
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        ) : (
                          <Archive className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode="library"
        product={editing}
      />
    </div>
  );
}
