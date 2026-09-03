import { useMemo } from "react";
import { useProductCategories, useProductImageUrl } from "@/lib/products/use-products";
import { categoryPath, formatMoney, itemTotal, type ProjectItem } from "@/lib/products/types";

/**
 * A4 LANDSCAPE product datasheets, generated live from Project Items.
 * Layout mirrors the historic PSA "Interior design proposal" sheet:
 * labelled data column on the left, large product image on the right,
 * finish/sample panel bottom-right.
 */
export function DatasheetPrintView({
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

  return (
    <div className="datasheet-root">
      <style>{`
        .datasheet-root { --sheet-w: 297mm; --sheet-h: 210mm; }
        .datasheet-page {
          width: var(--sheet-w);
          min-height: var(--sheet-h);
          margin: 0 auto 16px;
          background: #fff;
          color: #333;
          padding: 8mm 10mm 6mm;
          box-shadow: 0 1px 8px rgba(0,0,0,.12);
          display: flex;
          flex-direction: column;
          break-inside: avoid;
          font-family: Helvetica, Arial, sans-serif;
        }
        .datasheet-page + .datasheet-page { break-before: page; }
        .ds-row { display: grid; grid-template-columns: 33% 1fr; align-items: start; gap: 6px; }
        .ds-label { text-align: right; font-weight: 700; font-size: 9.5pt; color: #444; padding-top: 3px; }
        .ds-value {
          border: 1px solid #b9b9b9;
          background: #fff;
          min-height: 20px;
          padding: 3px 6px;
          font-size: 9.5pt;
          line-height: 1.3;
          white-space: pre-wrap;
          word-break: break-word;
        }
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body * { visibility: hidden; }
          .datasheet-root, .datasheet-root * { visibility: visible; }
          .datasheet-root { position: absolute; inset: 0; }
          .datasheet-page { box-shadow: none; margin: 0; }
        }
      `}</style>

      {items.map((i, idx) => (
        <article key={i.id} className="datasheet-page">
          <header className="border-b border-neutral-300 pb-2 text-center">
            <h1 className="text-[17pt] font-bold uppercase tracking-tight text-neutral-800">
              Interior design proposal
            </h1>
            <p className="text-[9.5pt] text-neutral-600">
              {[projectName, clientName].filter(Boolean).join(" — ") || "—"}
            </p>
          </header>

          <div className="mt-3 grid flex-1 grid-cols-[42%_1fr] gap-6">
            {/* left: labelled data column */}
            <div className="space-y-1.5">
              <p className="mb-2 text-[12pt] font-bold text-neutral-800">{projectName || "—"}</p>
              <Row label="Category" value={categoryPath(i.category_id, catMap)} />
              <Row label="Manufacturer" value={i.manufacturer} />
              <Row label="Location" value={i.location} />
              <Row label="Plan ID" value={i.reference} />
              <Row label="Designer" value={i.designer} />
              <Row label="Item Name" value={i.name} />
              <Row label="Ref: Code" value={i.reference} />
              <Row label="Material" value={i.material_spec} minHeight={60} />
              <Row label="Dimensions" value={i.dimensions} />
              <Row label="Weight" value={i.weight} />
              <Row label="Unit Price" value={formatMoney(i.unit_price, i.currency)} half />
              <Row label="Quantity" value={String(Number(i.quantity) || 0)} half />
              <Row label="Total" value={formatMoney(itemTotal(i), i.currency) || "€0.00"} half />
              <Row label="Notes:" value={i.notes} minHeight={70} />
              <Row label="Product Link" value={i.product_url} minHeight={40} />
              <Row label="Client approval signature" value="" minHeight={60} />
            </div>

            {/* right: large image + finish panel */}
            <div className="flex flex-col gap-3">
              <p className="text-[12pt] font-bold text-neutral-800">{i.name}</p>
              <SheetImage path={i.primary_image_path} alt={i.name} />
              <div className="grid grid-cols-[70px_1fr] items-start gap-3">
                <p className="pt-1 text-right text-[9.5pt] font-bold text-neutral-600">Finish</p>
                <FinishPanel path={i.finish_image_path} label={i.selected_finish} />
              </div>
            </div>
          </div>

          <footer className="mt-2 flex items-end justify-between">
            <span className="text-[8pt] text-neutral-400">
              {String(idx + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            </span>
            <span className="text-[12pt] font-bold text-neutral-600">www.pedrasilva.com</span>
          </footer>
        </article>
      ))}
    </div>
  );
}

function Row({
  label,
  value,
  minHeight,
  half,
}: {
  label: string;
  value?: string | null;
  minHeight?: number;
  half?: boolean;
}) {
  return (
    <div className="ds-row">
      <span className="ds-label">{label}</span>
      <span
        className="ds-value"
        style={{
          minHeight: minHeight ? `${minHeight}px` : undefined,
          width: half ? "55%" : undefined,
        }}
      >
        {value || ""}
      </span>
    </div>
  );
}

function SheetImage({ path, alt }: { path: string | null; alt: string }) {
  const { data: url } = useProductImageUrl(path, 1600);
  if (!url) {
    return <div className="min-h-[105mm] flex-1 border border-neutral-300 bg-white" />;
  }
  return (
    <div className="flex min-h-[105mm] flex-1 items-center justify-center border border-neutral-300 bg-white p-2">
      <img src={url} alt={alt} className="max-h-[103mm] w-full object-contain" />
    </div>
  );
}

function FinishPanel({ path, label }: { path: string | null; label?: string | null }) {
  const { data: url } = useProductImageUrl(path, 700);
  return (
    <div className="flex h-[38mm] w-full items-center justify-center border border-neutral-300 bg-white p-1">
      {url ? (
        <img src={url} alt="Finish sample" className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-[9pt] text-neutral-500">{label || ""}</span>
      )}
    </div>
  );
}
