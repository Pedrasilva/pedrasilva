import { useMemo } from "react";
import { useProductCategories, useProductImageUrl } from "@/lib/products/use-products";
import { categoryPath, formatMoney, itemTotal, type ProjectItem } from "@/lib/products/types";

/**
 * A4 LANDSCAPE product datasheets, generated live from Project Items.
 * There is no datasheet table — the schedule and these sheets read the same
 * records. Printing uses the browser (same approach as the offer summary).
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
          color: #111;
          padding: 14mm 16mm;
          box-shadow: 0 1px 8px rgba(0,0,0,.12);
          display: flex;
          flex-direction: column;
          break-inside: avoid;
        }
        .datasheet-page + .datasheet-page { break-before: page; }
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
          <header className="flex items-baseline justify-between border-b border-neutral-300 pb-3">
            <div>
              <p className="text-[10pt] uppercase tracking-[0.18em] text-neutral-500">
                Pedra Silva Architects — Product datasheet
              </p>
              <h1 className="mt-1 text-[19pt] font-semibold leading-tight">{i.name}</h1>
            </div>
            <div className="text-right text-[9.5pt] leading-snug text-neutral-600">
              <p className="font-medium text-neutral-900">{projectName}</p>
              {clientName && <p>{clientName}</p>}
              <p>
                {[i.location, i.reference].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="text-neutral-400">
                {String(idx + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </p>
            </div>
          </header>

          <div className="mt-5 grid flex-1 grid-cols-[1.35fr_1fr] gap-8">
            <SheetImage path={i.primary_image_path} alt={i.name} />

            <div className="flex flex-col gap-4 text-[10pt]">
              <Grid
                rows={[
                  ["Manufacturer", i.manufacturer],
                  ["Designer", i.designer],
                  ["Category", categoryPath(i.category_id, catMap)],
                  ["Dimensions", i.dimensions],
                  ["Material / specification", i.material_spec],
                  ["Selected finish / colour", i.selected_finish],
                ]}
              />

              {i.finish_image_path && (
                <div>
                  <p className="mb-1 text-[8.5pt] uppercase tracking-widest text-neutral-500">
                    Finish / sample
                  </p>
                  <SheetImage path={i.finish_image_path} alt="Finish sample" small />
                </div>
              )}

              <div className="mt-auto border-t border-neutral-300 pt-3">
                <div className="grid grid-cols-3 gap-3 text-[10pt]">
                  <Kpi label="Quantity" value={String(Number(i.quantity) || 0)} />
                  <Kpi label="Unit price" value={formatMoney(i.unit_price, i.currency) || "—"} />
                  <Kpi label="Total" value={formatMoney(itemTotal(i), i.currency) || "—"} strong />
                </div>
                {i.notes && (
                  <p className="mt-3 whitespace-pre-wrap text-[9pt] leading-snug text-neutral-700">
                    {i.notes}
                  </p>
                )}
                {i.product_url && (
                  <p className="mt-2 break-all text-[8.5pt] text-neutral-500">{i.product_url}</p>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function SheetImage({
  path,
  alt,
  small,
}: {
  path: string | null;
  alt: string;
  small?: boolean;
}) {
  const { data: url } = useProductImageUrl(path, small ? 480 : 1400);
  const h = small ? "h-[28mm]" : "h-full min-h-[110mm]";
  if (!url) {
    return <div className={`${h} w-full rounded border border-dashed border-neutral-300`} />;
  }
  return (
    <img
      src={url}
      alt={alt}
      className={`${h} w-full rounded border border-neutral-200 object-contain bg-neutral-50`}
    />
  );
}

function Grid({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  return (
    <dl className="grid grid-cols-[42%_1fr] gap-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[8.5pt] uppercase tracking-widest text-neutral-500">{k}</dt>
          <dd className="text-[10pt] leading-snug">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[8pt] uppercase tracking-widest text-neutral-500">{label}</p>
      <p className={strong ? "text-[12pt] font-semibold" : "text-[11pt]"}>{value}</p>
    </div>
  );
}
