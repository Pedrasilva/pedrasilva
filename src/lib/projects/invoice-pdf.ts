import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { format, parseISO } from "date-fns";
import type { Invoice, InvoiceLineItem } from "@/lib/projects/use-invoices";

export interface InvoicePdfInput {
  invoice: Invoice;
  items: InvoiceLineItem[];
  project: { name: string; client: string | null };
  related?: Array<{
    raised_date: string;
    due_date: string;
    invoice_number: string;
    title: string | null;
    bill_to_name: string | null;
    total: number;
    outstanding: number;
  }>;
  brand?: {
    company?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
}

const ACCENT = rgb(0.231, 0.51, 0.965);
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.45, 0.45, 0.5);
const BAND = rgb(0.95, 0.96, 0.98);
const HAIRLINE = rgb(0.86, 0.88, 0.92);

function eur(n: number) {
  return `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = INK) {
  page.drawText(text, { x, y, size, font, color });
}

function drawRight(page: PDFPage, text: string, rightX: number, y: number, font: PDFFont, size: number, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { invoice, items, project, related = [], brand } = input;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth();
  const H = page.getHeight();
  const M = 48;
  let y = H - M;

  const company = brand?.company ?? "Your Company";
  drawText(page, company.toUpperCase(), M, y - 4, bold, 16, INK);
  y -= 22;
  if (brand?.phone) {
    drawText(page, brand.phone, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (brand?.email) {
    drawText(page, brand.email, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (brand?.address) {
    drawText(page, brand.address, M, y, font, 9, MUTED);
    y -= 12;
  }

  let ry = H - M;
  drawRight(page, `Invoice ${invoice.invoice_number}`, W - M, ry - 4, font, 22, INK);
  ry -= 28;
  if (invoice.due_date) {
    drawRight(page, `Due: ${format(parseISO(invoice.due_date), "dd/MM/yyyy")}`, W - M, ry, font, 9, MUTED);
  }
  ry -= 18;
  const subtotal = items.reduce((a, it) => a + Number(it.quantity) * Number(it.rate), 0);
  const tax = subtotal * (Number(invoice.tax_rate) / 100);
  const total = subtotal + tax;
  drawRight(page, `Total: ${eur(total)}`, W - M, ry, font, 16, INK);
  ry -= 18;
  drawRight(page, `Tax: ${eur(tax)}`, W - M, ry, font, 9, MUTED);

  y = Math.min(y, ry) - 28;

  const heading = invoice.title || `Invoice for ${invoice.bill_to_name ?? project.client ?? "Client"}`;
  drawText(page, heading, M, y, font, 18, INK);
  y -= 18;
  if (invoice.bill_to_name) {
    drawText(page, `Attention: ${invoice.bill_to_name}`, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (invoice.reference) {
    drawText(page, invoice.reference, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (invoice.notes) {
    drawText(page, invoice.notes, M, y, font, 9, MUTED);
    y -= 12;
  }
  y -= 18;

  page.drawRectangle({ x: M, y: y - 18, width: W - M * 2, height: 22, color: BAND });
  drawText(page, "Invoice Items", M + 10, y - 12, font, 10, INK);
  y -= 30;

  const colX = {
    desc: M,
    qty: W - M - 320,
    price: W - M - 250,
    taxCode: W - M - 170,
    taxAmt: W - M - 110,
    total: W - M,
  };
  drawText(page, "Services", colX.desc, y, bold, 9, ACCENT);
  drawRight(page, "Qty", colX.qty + 30, y, bold, 9, INK);
  drawRight(page, "Price Per Unit", colX.price + 70, y, bold, 9, INK);
  drawRight(page, "Tax Code", colX.taxCode + 60, y, bold, 9, INK);
  drawRight(page, "Tax Amount", colX.taxAmt + 60, y, bold, 9, INK);
  drawRight(page, "Total", colX.total, y, bold, 9, INK);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: HAIRLINE });
  y -= 14;

  for (const it of items) {
    const amount = Number(it.quantity) * Number(it.rate);
    const itTax = amount * (Number(invoice.tax_rate) / 100);
    drawText(page, it.description, colX.desc, y, font, 9, INK);
    drawRight(page, Number(it.quantity).toFixed(2), colX.qty + 30, y, font, 9, INK);
    drawRight(page, eur(Number(it.rate)), colX.price + 70, y, font, 9, INK);
    drawRight(page, "VAT / IVA", colX.taxCode + 60, y, font, 9, INK);
    drawRight(page, eur(itTax), colX.taxAmt + 60, y, font, 9, INK);
    drawRight(page, eur(amount + itTax), colX.total, y, font, 9, INK);
    y -= 16;
  }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: HAIRLINE });
  y -= 18;

  const labelRight = W - M - 110;
  drawRight(page, "Sub-total", labelRight, y, font, 9, MUTED);
  drawRight(page, eur(subtotal), W - M, y, font, 9, INK);
  y -= 16;
  drawRight(page, "Tax", labelRight, y, font, 9, MUTED);
  drawRight(page, eur(tax), W - M, y, font, 9, INK);
  y -= 18;
  drawRight(page, "Total", labelRight, y, bold, 12, ACCENT);
  drawRight(page, eur(total), W - M, y, bold, 14, ACCENT);
  y -= 32;

  if (related.length) {
    page.drawRectangle({ x: M, y: y - 18, width: W - M * 2, height: 22, color: BAND });
    drawText(page, "Related Invoices", M + 10, y - 12, font, 10, INK);
    y -= 30;

    const rcols = {
      raised: M,
      due: M + 90,
      id: M + 170,
      subject: M + 230,
      outstanding: W - M - 100,
      total: W - M,
    };
    drawText(page, "Date (raised)", rcols.raised, y, bold, 9, INK);
    drawText(page, "Due", rcols.due, y, bold, 9, INK);
    drawText(page, "Invoice ID", rcols.id, y, bold, 9, INK);
    drawText(page, "Subject", rcols.subject, y, bold, 9, INK);
    drawRight(page, "Outstanding", rcols.outstanding + 80, y, bold, 9, INK);
    drawRight(page, "Total", rcols.total, y, bold, 9, INK);
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: HAIRLINE });
    y -= 14;

    for (const r of related) {
      if (y < M + 40) break;
      drawText(page, format(parseISO(r.raised_date), "dd/MM/yyyy"), rcols.raised, y, font, 9, INK);
      drawText(page, format(parseISO(r.due_date), "dd/MM/yyyy"), rcols.due, y, font, 9, INK);
      drawText(page, r.invoice_number.replace(/^#/, ""), rcols.id, y, font, 9, INK);
      const subj = r.title || `Invoice for ${r.bill_to_name ?? "Client"}`;
      drawText(page, subj.length > 48 ? subj.slice(0, 45) + "…" : subj, rcols.subject, y, font, 9, INK);
      drawRight(page, eur(r.outstanding), rcols.outstanding + 80, y, font, 9, INK);
      drawRight(page, eur(r.total), rcols.total, y, font, 9, INK);
      y -= 16;
    }
  }

  page.drawLine({ start: { x: M, y: M - 8 }, end: { x: W - M, y: M - 8 }, thickness: 0.5, color: HAIRLINE });
  drawText(page, project.name, M, M - 22, font, 8, MUTED);
  drawRight(page, format(new Date(), "dd/MM/yyyy"), W - M, M - 22, font, 8, MUTED);

  return await doc.save();
}

export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const buf = bytes.slice().buffer;
  const blob = new Blob([buf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
