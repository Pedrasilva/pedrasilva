import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategorySelect } from "@/components/products/category-select";
import { useProductCategories, useSaveCategory } from "@/lib/products/use-products";
import type { ProductCategory } from "@/lib/products/types";

export const Route = createFileRoute("/_app/products/categories")({
  component: CategoriesPage,
  head: () => ({
    meta: [
      { title: "Product categories — PSA Hub taxonomy" },
      {
        name: "description",
        content: "Administer the product taxonomy used by the PSA product library and schedules.",
      },
      { property: "og:title", content: "Product categories — PSA Hub taxonomy" },
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
  const { data: categories = [] } = useProductCategories();
  const save = useSaveCategory();
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
      toast.success("Category added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the category");
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => save.mutate({ id: c.id, name: c.name, active: !c.active })}
          >
            {c.active ? "Active" : "Inactive"}
          </Button>
        </div>
        {render(c.id, depth + 1)}
      </div>
    ));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Generic taxonomy — new families (lighting, sanitaryware, finishes) can be added here.
        </p>
      </header>

      <Card className="flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <label className="text-xs text-muted-foreground">Category name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stool" />
        </div>
        <div className="w-[220px] space-y-1.5">
          <label className="text-xs text-muted-foreground">Parent</label>
          <CategorySelect value={parent} onChange={setParent} includeAll placeholder="Top level" />
        </div>
        <Button onClick={add} disabled={save.isPending}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </Card>

      <Card className="p-4">{render(null)}</Card>
    </div>
  );
}
