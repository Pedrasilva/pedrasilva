import { useMemo, useState } from "react";
import { Copy, ExternalLink, Search, Trash2, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "./category-select";
import { ProductImage } from "./product-image";
import { ProjectItemSheet } from "./project-item-sheet";
import {
  useDeleteProjectItem,
  useDuplicateProjectItem,
  useProductCategories,
  useUpdateProjectItem,
} from "@/lib/products/use-products";
import { categoryPath, formatMoney, itemTotal, type ProjectItem } from "@/lib/products/types";

type SortKey = "reference" | "location" | "name" | "manufacturer" | "total";

/**
 * The working view. Optimised for speed of entry: reference, location,
 * quantity, unit price and finish are edited inline; everything else opens a
 * side sheet.
 */
export function ProjectItemsTable({
  items,
  projectId,
}: {
  items: ProjectItem[];
  projectId: string;
}) {
  const { data: categories = [] } = useProductCategories();
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const update = useUpdateProjectItem();
  const duplicate = useDuplicateProjectItem();
  const remove = useDeleteProjectItem();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState<string>("__all__");
  const [sort, setSort] = useState<SortKey>("reference");
  const [open, setOpen] = useState<ProjectItem | null>(null);

  const locations = useMemo(
    () => Array.from(new Set(items.map((i) => i.location).filter(Boolean) as string[])).sort(),
    [items],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = items.filter((i) => {
      if (category && i.category_id !== category) return false;
      if (location !== "__all__" && (i.location ?? "") !== location) return false;
      if (!needle) return true;
      return [i.name, i.reference, i.manufacturer, i.designer, i.location, i.selected_finish]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle));
    });
    return [...list].sort((a, b) => {
      if (sort === "total") return itemTotal(b) - itemTotal(a);
      return String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, {
        numeric: true,
      });
    });
  }, [items, q, category, location, sort]);

  const grandTotal = rows.reduce((s, i) => s + itemTotal(i), 0);

  const patch = (item: ProjectItem, p: Partial<ProjectItem>) =>
    update.mutate({ id: item.id, projectId, patch: p });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search items"
          />
        </div>
        <CategorySelect
          value={category}
          onChange={setCategory}
          includeAll
          placeholder="All categories"
          className="w-[190px]"
        />
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[160px]">
            <ChevronsUpDown className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reference">Sort: reference</SelectItem>
            <SelectItem value="location">Sort: location</SelectItem>
            <SelectItem value="name">Sort: item</SelectItem>
            <SelectItem value="manufacturer">Sort: manufacturer</SelectItem>
            <SelectItem value="total">Sort: total</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[64px]">Image</TableHead>
              <TableHead className="w-[110px]">Ref.</TableHead>
              <TableHead className="w-[150px]">Location</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="w-[150px]">Manufacturer</TableHead>
              <TableHead className="w-[150px]">Category</TableHead>
              <TableHead className="w-[140px]">Finish</TableHead>
              <TableHead className="w-[80px] text-right">Qty</TableHead>
              <TableHead className="w-[110px] text-right">Unit price</TableHead>
              <TableHead className="w-[110px] text-right">Total</TableHead>
              <TableHead className="w-[110px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                  No items yet. Use “Add item” to browse the library or create a new product.
                </TableCell>
              </TableRow>
            )}
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <ProductImage path={i.primary_image_path} alt={i.name} className="h-10 w-10" width={120} />
                </TableCell>
                <TableCell>
                  <InlineText value={i.reference} onCommit={(v) => patch(i, { reference: v })} />
                </TableCell>
                <TableCell>
                  <InlineText
                    value={i.location}
                    list="product-locations"
                    onCommit={(v) => patch(i, { location: v })}
                  />
                </TableCell>
                <TableCell>
                  <button
                    className="text-left text-sm font-medium hover:underline"
                    onClick={() => setOpen(i)}
                  >
                    {i.name}
                  </button>
                  {i.designer && (
                    <span className="block text-[11px] text-muted-foreground">{i.designer}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{i.manufacturer ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {categoryPath(i.category_id, catMap) || "—"}
                </TableCell>
                <TableCell>
                  <InlineText
                    value={i.selected_finish}
                    onCommit={(v) => patch(i, { selected_finish: v })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <InlineNumber
                    value={i.quantity}
                    onCommit={(v) => patch(i, { quantity: v ?? 0 })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <InlineNumber
                    value={i.unit_price}
                    onCommit={(v) => patch(i, { unit_price: v })}
                  />
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatMoney(itemTotal(i), i.currency)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-0.5">
                    {i.product_url && (
                      <Button size="icon" variant="ghost" asChild aria-label="Open product page">
                        <a href={i.product_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Duplicate item"
                      onClick={() =>
                        duplicate
                          .mutateAsync(i)
                          .then(() => toast.success("Item duplicated"))
                          .catch((e) => toast.error(String(e)))
                      }
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete item"
                      onClick={() => {
                        if (confirm(`Remove “${i.name}” from this project?`))
                          remove.mutate({ id: i.id, projectId });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <datalist id="product-locations">
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <div className="flex justify-end gap-6 text-sm">
        <span className="text-muted-foreground">{rows.length} items</span>
        <span className="font-medium tabular-nums">{formatMoney(grandTotal)}</span>
      </div>

      <ProjectItemSheet
        item={open}
        projectId={projectId}
        onOpenChange={(v) => !v && setOpen(null)}
      />
    </div>
  );
}

function InlineText({
  value,
  onCommit,
  list,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
  list?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  return (
    <Input
      value={draft}
      list={list}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim() || null;
        if (next !== (value ?? null)) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-8 border-transparent bg-transparent px-1.5 text-sm hover:border-input focus:border-input"
    />
  );
}

function InlineNumber({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  return (
    <Input
      type="number"
      step="0.01"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft === "" ? null : Number(draft);
        if (next !== value) onCommit(Number.isNaN(next as number) ? null : next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-8 border-transparent bg-transparent px-1.5 text-right text-sm tabular-nums hover:border-input focus:border-input"
    />
  );
}
