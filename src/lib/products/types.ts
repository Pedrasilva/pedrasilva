/**
 * Product Library — shared types.
 *
 * Deliberately generic (product / project item / category / file) so future
 * families (lighting, sanitaryware, brassware, finishes, construction
 * materials) drop in without a schema rebuild.
 */

/**
 * FILE SOURCE OF TRUTH (locked for V1)
 *
 * `primary_image_path` / `finish_image_path` on library products and project
 * items are CANONICAL for the two images the datasheet and schedule render.
 * They are plain storage paths in the bucket below — never references into
 * `product_files`.
 *
 * `product_files` is SUPPLEMENTARY ONLY: manufacturer PDFs, technical sheets,
 * price lists, and future DWG/SKP/IFC. It may point at a Drive file
 * (`drive_file_id` / `url`) or at bucket storage. Nothing in the UI reads a
 * datasheet image out of `product_files`, so the two mechanisms cannot drift.
 *
 * Why images are not on Google Drive: Drive serves file bytes only through
 * authenticated API calls with short-lived, non-transformable links — there is
 * no thumbnail/resize endpoint usable directly in an <img> tag, and a 100-row
 * schedule would need 100 proxied downloads per render. The minimal hybrid we
 * adopted: images (small, render-hot) in this private bucket with signed,
 * width-transformed URLs; documents (large, render-cold) linked in Drive via
 * `product_files`. Structured data stays in the database either way.
 */
export const PRODUCT_IMAGE_BUCKET = "product-library";

export type ProductStatus = "current" | "archived";

/**
 * Lightweight project-item attribute — NOT a workflow. No notifications,
 * no permissions, no state machine in V1.
 */
export type ProductApprovalStatus = "proposed" | "approved" | "rejected";
export const APPROVAL_STATUSES: ProductApprovalStatus[] = ["proposed", "approved", "rejected"];

export interface ProductCategory {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface LibraryProduct {
  id: string;
  name: string;
  category_id: string | null;
  manufacturer: string | null;
  designer: string | null;
  material_spec: string | null;
  dimensions: string | null;
  weight: string | null;
  ref_code: string | null;
  indicative_unit_price: number | null;
  currency: string;
  price_last_updated: string | null;
  product_url: string | null;
  primary_image_path: string | null;
  finish_image_path: string | null;
  notes: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectItem {
  id: string;
  project_id: string;
  source_library_product_id: string | null;
  reference: string | null;
  location: string | null;
  name: string;
  category_id: string | null;
  manufacturer: string | null;
  designer: string | null;
  material_spec: string | null;
  dimensions: string | null;
  weight: string | null;
  selected_finish: string | null;
  quantity: number;
  unit_price: number | null;
  currency: string;
  product_url: string | null;
  primary_image_path: string | null;
  finish_image_path: string | null;
  notes: string | null;
  approval_status: ProductApprovalStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Project item total = quantity × unit price (never stored). */
export function itemTotal(item: Pick<ProjectItem, "quantity" | "unit_price">): number {
  return (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
}

/** "Furniture › Chair" style label for a category id. */
export function categoryPath(
  id: string | null | undefined,
  byId: Map<string, ProductCategory>,
): string {
  if (!id) return "";
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 6) {
    parts.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(" › ");
}

export function formatMoney(value: number | null | undefined, currency = "EUR"): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}
