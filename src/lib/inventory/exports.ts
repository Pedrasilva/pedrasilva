/**
 * Inventory exports — XLSX / CSV report builders.
 *
 * Reuses the `xlsx` dependency already present in the project. Every report is
 * built from the same in-memory asset list, so what you export is exactly what
 * the register shows.
 */
import * as XLSX from "xlsx";
import {
  indicativeDepreciatedValue,
  insuranceRegisterValue,
  isActive,
  isDueForReplacement,
  plannedReplacementDate,
  type InventoryAsset,
  type InventoryCategory,
} from "./types";

export type ExportContext = {
  categories: Map<string, InventoryCategory>;
  collaborators: Map<string, string>;
};

const fmtDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
const num = (v: number | null | undefined) => (v == null ? "" : Math.round(v * 100) / 100);

function baseRow(a: InventoryAsset, ctx: ExportContext) {
  return {
    "Asset code": a.asset_code,
    Category: ctx.categories.get(a.category_id)?.name ?? "",
    Name: a.name,
    Brand: a.brand ?? "",
    Model: a.model ?? "",
    "Serial number": a.serial_number ?? "",
    "Tracking level": a.tracking_level,
    Status: a.status,
    Custody: a.custody_mode,
    "Assigned to": a.assigned_collaborator_id
      ? (ctx.collaborators.get(a.assigned_collaborator_id) ?? "")
      : "",
    Location: a.location ?? "",
    Supplier: a.invoice_number_snapshot ? `Invoice ${a.invoice_number_snapshot}` : "",
    "Purchase date": fmtDate(a.purchase_date),
    "Purchase price (ex. VAT)": num(a.purchase_price_ex_vat),
    "Indicative depreciated value": num(indicativeDepreciatedValue(a)),
    "Insurance / replacement value": num(a.insurance_value),
    "Warranty expiry": fmtDate(a.warranty_expiry),
    "Depreciation (years)": a.depreciation_years,
    "Replacement cycle (years)": a.replacement_years,
    "Planned replacement": fmtDate(plannedReplacementDate(a)?.toISOString() ?? null),
  };
}

export type ReportKey =
  | "full"
  | "insurance"
  | "byCollaborator"
  | "byLocation"
  | "replacement"
  | "retired";

export function buildReportRows(
  key: ReportKey,
  assets: InventoryAsset[],
  ctx: ExportContext,
): Record<string, unknown>[] {
  switch (key) {
    case "insurance":
      return assets
        .filter((a) => a.include_in_insurance_register && isActive(a))
        .map((a) => ({
          "Asset code": a.asset_code,
          Category: ctx.categories.get(a.category_id)?.name ?? "",
          Description: a.name,
          Brand: a.brand ?? "",
          Model: a.model ?? "",
          "Serial number": a.serial_number ?? "",
          "Purchase date": fmtDate(a.purchase_date),
          "Purchase price": num(a.purchase_price_ex_vat),
          "Indicative current value": num(indicativeDepreciatedValue(a)),
          "Insured value": num(insuranceRegisterValue(a)),
          Location: a.location ?? "",
          "Assigned to": a.assigned_collaborator_id
            ? (ctx.collaborators.get(a.assigned_collaborator_id) ?? "")
            : "",
          Status: a.status,
        }));
    case "byCollaborator":
      return assets
        .filter((a) => a.custody_mode === "person" && a.assigned_collaborator_id && isActive(a))
        .sort((x, y) =>
          (ctx.collaborators.get(x.assigned_collaborator_id!) ?? "").localeCompare(
            ctx.collaborators.get(y.assigned_collaborator_id!) ?? "",
          ),
        )
        .map((a) => baseRow(a, ctx));
    case "byLocation":
      return assets
        .filter((a) => isActive(a))
        .sort((x, y) => (x.location ?? "").localeCompare(y.location ?? ""))
        .map((a) => baseRow(a, ctx));
    case "replacement":
      return assets
        .filter((a) => isActive(a))
        .filter((a) => isDueForReplacement(a) || !!plannedReplacementDate(a))
        .sort(
          (x, y) =>
            (plannedReplacementDate(x)?.getTime() ?? 0) -
            (plannedReplacementDate(y)?.getTime() ?? 0),
        )
        .map((a) => ({ ...baseRow(a, ctx), "Due now": isDueForReplacement(a) ? "Yes" : "No" }));
    case "retired":
      return assets.filter((a) => !isActive(a)).map((a) => baseRow(a, ctx));
    case "full":
    default:
      return assets.map((a) => baseRow(a, ctx));
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportRows(
  rows: Record<string, unknown>[],
  filename: string,
  format: "xlsx" | "csv",
) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Inventory");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  download(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${filename}.xlsx`,
  );
}
