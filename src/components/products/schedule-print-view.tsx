import { useMemo } from "react";
import { useProductCategories, useProductImageUrl } from "@/lib/products/use-products";
import { categoryPath, formatMoney, itemTotal, type ProjectItem } from "@/lib/products/types";

/**
 * Consolidated project schedule, A4 landscape, print/PDF output.
 * Mirrors the historic PSA schedule: image thumbnail, location, plan id,
 * item, designer, manufacturer, category, material, dimensions, qty, price.
 */
export function SchedulePrintView({
  items,
  projectName,
  clientName,
}: {
  items: ProjectItem[];
  projectName: string;
  clientName?: string | null;
}) {
  const { data: categories = [] } = useProductCategories();
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const total = items.reduce((s, i) => s + itemTotal(i), 0);
  const currency = items[0]?.currency ?? "EUR";

  return (
    <div className="schedule-root">
      <style>{`
        .schedule-root { background: #fff; color: #222; font-family: Helvetica, Arial, sans-serif; }
        .schedule-sheet { width: 297mm; margin: 0 auto; padding: 8mm 8mm 6mm; }
        .schedule-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .schedule-table th, .schedule-table td {
          border: 1px solid #9a9a9a;
          padding: 4px 5px;
          font-size: 7.5pt;
          line-height: 1.25;
          vertical-align: middle;
          word-break: break-word;
        }
        .schedule-table th { background: #ececec; font-weight: 700; text-align: center; }
        .schedule-table tr { break-inside: avoid; }
        .schedule-table thead { display: table-header-group; }
        .schedule-num { text-align: right; white-space: nowrap; }
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body > *:not(.psa-print-portal) { display: none !important; }
          .psa-print-portal {
            position: static !important;
            inset: auto !important;
            overflow: visible !important;
            background: #fff !important;
            padding: 0 !important;
            z-index: auto !important;
          }
          .schedule-root { position: static; }
          .schedule-sheet { width: auto; padding: 12mm 12mm 10mm; }
        }
      `}</style>

      <div className="schedule-sheet">
        <header className="mb-3 flex items-end justify-between border-b border-neutral-400 pb-2">
          <div>
            <h1 className="text-[13pt] font-bold uppercase tracking-tight">Furniture schedule</h1>
            <p className="text-[9pt] text-neutral-600">
              {[projectName, clientName].filter(Boolean).join(" — ") || "—"}
            </p>
          </div>
          <span className="text-[10pt] font-bold text-neutral-600">www.pedrasilva.com</span>
        </header>

        <table className="schedule-table">
          <colgroup>
            <col style={{ width: "11%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "4%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Image</th>
              <th>Location</th>
              <th>Plan ID</th>
              <th>Item name</th>
              <th>Designer</th>
              <th>Manufacturer</th>
              <th>Category</th>
              <th>Material</th>
              <th>Dimensions</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  <Thumb path={i.primary_image_path} alt={i.name} />
                </td>
                <td>{i.location ?? ""}</td>
                <td>{i.reference ?? ""}</td>
                <td>{i.name}</td>
                <td>{i.designer ?? ""}</td>
                <td>{i.manufacturer ?? ""}</td>
                <td>{categoryPath(i.category_id, catMap)}</td>
                <td>{i.material_spec ?? ""}</td>
                <td>{i.dimensions ?? ""}</td>
                <td className="schedule-num">{Number(i.quantity) || 0}</td>
                <td className="schedule-num">{formatMoney(i.unit_price, i.currency)}</td>
                <td className="schedule-num">{formatMoney(itemTotal(i), i.currency)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={11} className="schedule-num" style={{ fontWeight: 700 }}>
                TOTAL
              </td>
              <td className="schedule-num" style={{ fontWeight: 700 }}>
                {formatMoney(total, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Thumb({ path, alt }: { path: string | null; alt: string }) {
  const { data: url } = useProductImageUrl(path, 400);
  if (!url) return <div className="h-[22mm] w-full" />;
  return (
    <div className="flex h-[22mm] w-full items-center justify-center">
      <img src={url} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
