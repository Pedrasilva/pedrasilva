import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProductCategories } from "@/lib/products/use-products";
import type { ProductCategory } from "@/lib/products/types";

const NONE = "__none__";

/** Flat, indented category picker over the administrable category tree. */
export function CategorySelect({
  value,
  onChange,
  placeholder = "Category",
  className,
  includeAll,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  includeAll?: boolean;
}) {
  const { data: categories = [] } = useProductCategories();
  const options = useMemo(() => flatten(categories), [categories]);

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{includeAll ? "All categories" : "—"}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.depth > 0 ? `${"\u00a0".repeat(o.depth * 3)}${o.name}` : o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function flatten(categories: ProductCategory[], parent: string | null = null, depth = 0):
  Array<ProductCategory & { depth: number }> {
  return categories
    .filter((c) => (c.parent_id ?? null) === parent && c.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .flatMap((c) => [{ ...c, depth }, ...flatten(categories, c.id, depth + 1)]);
}
