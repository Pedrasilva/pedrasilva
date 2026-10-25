import { translateError } from '@/lib/translate-error';
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from '@/lib/toast';
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategorySelect } from "@/components/products/category-select";
import { useProductCategories, useSaveCategory } from "@/lib/products/use-products";
import type { ProductCategory } from "@/lib/products/types";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";

export const Route = createFileRoute("/_app/products/categories")({
  component: CategoriesPage,
  head: () => ({
    meta: [
      { title: "Product categories — Portal Pedra Silva taxonomy" },
      {
        name: "description",
        content: "Administer the product taxonomy used by the PSA product library and schedules.",
      },
      { property: "og:title", content: "Product categories — Portal Pedra Silva taxonomy" },
      {
        property: "og:description",
        content: "Administer the product taxonomy used by the PSA product library and schedules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CategoriesPage() {
  useTranslation();
  const { data: categories = [] } = useProductCategories();
  const save = useSaveCategory();
  const canEdit = useMyPermissionsV2().can("products.edit", "all");
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | null>(null);

  const tree = useMemo(() => {
    const byParent = new Map<string | null, ProductCategory[]>();
    for (const c of categories) {
      const list = byParent.get(c.parent_id) ?? [];
      list.push(c);
      byParent.set(c.parent_id, list);
    }
    return byParent;
  }, [categories]);

  const add = async () => {
    if (!name.trim()) return;
    try {
      await save.mutateAsync({ name: name.trim(), parent_id: parent, active: true });
      setName("");
      toast.success(uiI18n.t("crm:products.categoryAdded"));
    } catch (e) {
      toast.error(e instanceof Error ? translateError(e.message) : uiI18n.t("crm:products.categoryFailed"));
    }
  };

  const render = (parentId: string | null, depth = 0): React.ReactNode =>
    (tree.get(parentId) ?? []).map((c) => (
      <div key={c.id}>
        <div
          className="flex items-center justify-between border-b py-2 text-sm"
          style={{ paddingLeft: depth * 18 }}
        >
          <span>{c.name}</span>
          {canEdit ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => save.mutate({ id: c.id, name: c.name, active: !c.active })}
            >
              {c.active ? uiI18n.t("common:active") : uiI18n.t("common:inactive")}
            </Button>
          ) : (
            <span className="px-3 text-xs text-muted-foreground">
              {c.active ? uiI18n.t("common:active") : uiI18n.t("common:inactive")}
            </span>
          )}
        </div>
        {render(c.id, depth + 1)}
      </div>
    ));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight"> {uiI18n.t("common:categories")} </h1>
        <p className="text-sm text-muted-foreground">
           {uiI18n.t("crm:products.categoriesSub")} </p>
      </header>

      {canEdit && (
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground"> {uiI18n.t("crm:products.categoryName")} </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={uiI18n.t("crm:products.categoryHint")} />
          </div>
          <div className="w-[220px] space-y-1.5">
            <label className="text-xs text-muted-foreground"> {uiI18n.t("crm:products.parentCategory")} </label>
            <CategorySelect value={parent} onChange={setParent} includeAll placeholder={uiI18n.t("crm:products.topLevel")} />
          </div>
          <Button onClick={add} disabled={save.isPending}>
            <Plus className="mr-1.5 h-4 w-4" />
             {uiI18n.t("common:add")} </Button>
        </Card>
      )}

      <Card className="p-4">{render(null)}</Card>
    </div>
  );
}
