/**
 * Inventory module — shared types and pure helpers.
 *
 * Core rule: Finance owns the expense (invoice, supplier, price, VAT).
 * Inventory owns the physical asset (code, custody, condition, depreciation,
 * insurance, lifecycle). Nothing here ever writes a financial record.
 */

export type TrackingLevel = "major" | "standard" | "accessory";

export type AssetStatus =
  | "available"
  | "in_use"
  | "spare"
  | "repair"
  | "retired"
  | "lost"
  | "disposed";

export type CustodyMode = "person" | "shared" | "location";

export type InventoryWorkflowStatus = "pending" | "partially_processed" | "complete";

export const TRACKING_LEVELS: TrackingLevel[] = ["major", "standard", "accessory"];

export const ASSET_STATUSES: AssetStatus[] = [
  "available",
  "in_use",
  "spare",
  "repair",
  "retired",
  "lost",
  "disposed",
];

export const CUSTODY_MODES: CustodyMode[] = ["person", "shared", "location"];

/** Statuses that no longer count as part of the active fleet. */
export const INACTIVE_STATUSES: AssetStatus[] = ["retired", "lost", "disposed"];

export type InventoryCategory = {
  id: string;
  code: string;
  name: string;
  default_depreciation_years: number;
  default_replacement_years: number;
  default_tracking_level: TrackingLevel;
  sort_order: number;
  is_active: boolean;
};

export type InventoryKit = {
  id: string;
  name: string;
  description: string | null;
};

export type InventoryAsset = {
  id: string;
  asset_code: string;
  name: string;
  category_id: string;
  tracking_level: TrackingLevel;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  description: string | null;
  photo_path: string | null;
  status: AssetStatus;
  custody_mode: CustodyMode;
  assigned_collaborator_id: string | null;
  location: string | null;
  department: string | null;
  supplier_company_id: string | null;
  purchase_date: string | null;
  purchase_price_ex_vat: number | null;
  vat_amount: number | null;
  purchase_price_inc_vat: number | null;
  invoice_number_snapshot: string | null;
  source_document_id: string | null;
  source_document_line_id: string | null;
  source_unit_index: number | null;
  warranty_expiry: string | null;
  depreciation_years: number;
  replacement_years: number;
  insurance_value: number | null;
  include_in_insurance_register: boolean;
  kit_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryAssignment = {
  id: string;
  asset_id: string;
  custody_mode: CustodyMode;
  collaborator_id: string | null;
  location: string | null;
  department: string | null;
  assigned_on: string;
  returned_on: string | null;
  notes: string | null;
  created_at: string;
};

export type InventoryAssetEvent = {
  id: string;
  asset_id: string;
  event_type: string;
  event_date: string;
  field: string | null;
  previous_value: string | null;
  new_value: string | null;
  notes: string | null;
  created_at: string;
};

export type LineProcessing = {
  line_id: string;
  document_id: string;
  quantity_total: number;
  quantity_processed: number;
  quantity_remaining: number;
  max_unit_index: number;
};

/* ────────────────────────────── helpers ────────────────────────────── */

const MS_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Age of the asset in fractional years, from its purchase date. */
export function assetAgeYears(asset: Pick<InventoryAsset, "purchase_date">, now = new Date()): number {
  if (!asset.purchase_date) return 0;
  const start = new Date(asset.purchase_date).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, (now.getTime() - start) / MS_YEAR);
}

/** Straight-line annual depreciation, for management reporting only. */
export function annualDepreciation(asset: InventoryAsset): number {
  const base = asset.purchase_price_ex_vat ?? 0;
  const years = asset.depreciation_years || 0;
  if (!base || years <= 0) return 0;
  return base / years;
}

/**
 * Indicative depreciated value (NOT statutory book value): straight line from
 * the purchase price down to zero over the depreciation period.
 */
export function indicativeDepreciatedValue(asset: InventoryAsset, now = new Date()): number {
  const base = asset.purchase_price_ex_vat ?? 0;
  if (!base) return 0;
  const years = asset.depreciation_years || 0;
  if (years <= 0) return base;
  const value = base - annualDepreciation(asset) * assetAgeYears(asset, now);
  return Math.max(0, Math.round(value * 100) / 100);
}

/**
 * Value used on the insurance register: the declared insurance / replacement
 * value when present, otherwise the original purchase price as a fallback.
 */
export function insuranceRegisterValue(asset: InventoryAsset): number {
  if (asset.insurance_value != null) return asset.insurance_value;
  return asset.purchase_price_ex_vat ?? 0;
}

/** Planned replacement date derived from the purchase date + replacement cycle. */
export function plannedReplacementDate(asset: InventoryAsset): Date | null {
  if (!asset.purchase_date || !asset.replacement_years) return null;
  const d = new Date(asset.purchase_date);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + asset.replacement_years);
  return d;
}

/** True when the asset has reached (or passed) its planned replacement date. */
export function isDueForReplacement(asset: InventoryAsset, now = new Date()): boolean {
  if (INACTIVE_STATUSES.includes(asset.status)) return false;
  const due = plannedReplacementDate(asset);
  return !!due && due.getTime() <= now.getTime();
}

export function isActive(asset: InventoryAsset): boolean {
  return !INACTIVE_STATUSES.includes(asset.status);
}

/** Warranty expiring within the given window (days), still in the future. */
export function warrantyExpiringWithin(asset: InventoryAsset, days: number, now = new Date()): boolean {
  if (!asset.warranty_expiry) return false;
  const exp = new Date(asset.warranty_expiry).getTime();
  if (Number.isNaN(exp)) return false;
  const delta = exp - now.getTime();
  return delta >= 0 && delta <= days * 24 * 60 * 60 * 1000;
}

/**
 * Guess a category code from a free-text invoice line description. Only a
 * suggestion — the review screen always lets the user override it.
 */
export function suggestCategoryCode(description: string): string {
  const d = (description || "").toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/macbook|laptop|notebook|imac|mac mini|desktop|computer|portátil/, "LAP"],
    [/monitor|display|studio display|ecrã|screen/, "MON"],
    [/keyboard|teclado/, "KBD"],
    [/mouse|magic trackpad|rato/, "MSE"],
    [/adapter|charger|power|magsafe|carregador|alimenta/, "PWR"],
    [/dock|hub|thunderbolt/, "DOC"],
    [/iphone|phone|telem/, "PHN"],
    [/ipad|tablet/, "TAB"],
    [/lens|lente|objectiva|objetiva/, "LNS"],
    [/camera|câmara|camara|dslr|mirrorless/, "CAM"],
    [/tripod|trip[ée]/, "TRP"],
    [/flash|speedlight/, "FLS"],
    [/printer|impressora|plotter/, "PRN"],
    [/nas|synology|server|servidor/, "NAS"],
    [/router|switch|access point|network|rede/, "NET"],
    [/chair|desk|table|cadeira|secretária|mesa|armário/, "FUR"],
  ];
  for (const [re, code] of rules) if (re.test(d)) return code;
  return "OTH";
}
