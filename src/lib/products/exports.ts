/**
 * Consolidated project schedule export.
 *
 * Same records as the datasheets — one source of truth. Uses the `xlsx`
 * dependency already present for the inventory reports.
 */
import * as XLSX from "xlsx";
import { categoryPath, itemTotal, type ProductCategory, type ProjectItem } from "./types";

export function scheduleRows(items: ProjectItem[], categories: Map<string, ProductCategory>) {
  return items.map((i) => ({
    Location: i.location ?? "",
    Reference: i.reference ?? "",
    Item: i.name,
    Designer: i.designer ?? "",
    Manufacturer: i.manufacturer ?? "",
    Category: categoryPath(i.category_id, categories),
    "Material / Specification": i.material_spec ?? "",
    Dimensions: i.dimensions ?? "",
    Weight: i.weight ?? "",
    Finish: i.selected_finish ?? "",
    Quantity: Number(i.quantity) || 0,
    "Unit price": i.unit_price == null ? "" : Number(i.unit_price),
    Total: Math.round(itemTotal(i) * 100) / 100,
    Notes: i.notes ?? "",
    URL: i.product_url ?? "",
  }));
}

export function exportSchedule(
  items: ProjectItem[],
  categories: Map<string, ProductCategory>,
  projectName: string,
) {
  const rows = scheduleRows(items, categories);
  const total = rows.reduce((s, r) => s + (Number(r.Total) || 0), 0);
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.sheet_add_aoa(sheet, [["", "", "", "", "", "", "", "", "", "", "TOTAL", Math.round(total * 100) / 100]], {
    origin: -1,
  });
  sheet["!cols"] = [
    { wch: 18 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 22 },
    { wch: 36 }, { wch: 20 }, { wch: 18 }, { wch: 9 }, { wch: 12 }, { wch: 12 },
    { wch: 40 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Schedule");
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = projectName.replace(/[^\w\s-]/g, "").trim() || "project";
  XLSX.writeFile(wb, `${safe} ${stamp} furniture schedule.xlsx`);
}
