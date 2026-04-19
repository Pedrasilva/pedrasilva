import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { format, parseISO } from "date-fns";
import type { Invoice, InvoiceLineItem } from "./use-invoices";
import type { InvoiceSettings } from "./use-invoice-settings";

export interface InvoicePdfInput {
  invoice: Invoice;
  items: InvoiceLineItem[];
  project: { name: string; client: string | null };
  settings: InvoiceSettings;
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
  const { invoice, items, project, settings } = input;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth();
  const H = page.getHeight();
  const M = 48;
  let y = H - M;

  // HEADER
  drawText(page, (settings.company_name || "Company").toUpperCase(), M, y - 4, bold, 16, INK);
  y -= 22;
  if (settings.company_phone) {
    drawText(page, settings.company_phone, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (settings.company_email) {
    drawText(page, settings.company_email, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (settings.company_address) {
    drawText(page, settings.company_address, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (settings.company_nif) {
    drawText(page, `NIF: ${settings.company_nif}`, M, y, font, 9, MUTED);
    y -= 12;
  }

  let ry = H - M;
  drawRight(page, `Invoice ${invoice.invoice_number}`, W - M, ry - 4, font, 22, INK);
  ry -= 28;
  if (invoice.due_date) {
    drawRight(page, `Due: ${format(parseISO(invoice.due_date), "dd/MM/yyyy")}`, W - M, ry, font, 9, MUTED);
    ry -= 18;
  }
  drawRight(page, `Total: ${eur(Number(invoice.total))}`, W - M, ry, font, 16, INK);
  ry -= 18;
  drawRight(page, `IVA: ${eur(Number(invoice.vat_amount))}`, W - M, ry, font, 9, MUTED);

  y = Math.min(y, ry) - 28;

  // INVOICE FOR
  const heading = `Invoice for ${invoice.client_name || project.client || "Client"}`;
  drawText(page, heading, M, y, font, 18, INK);
  y -= 18;
  if (invoice.client_address) {
    drawText(page, invoice.client_address, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (invoice.client_nif) {
    drawText(page, `NIF: ${invoice.client_nif}`, M, y, font, 9, MUTED);
    y -= 12;
  }
  if (invoice.notes) {
    drawText(page, invoice.notes, M, y, font, 9, MUTED);
    y -= 12;
  }
  y -= 18;

  // ITEMS BAND
  page.drawRectangle({ x: M, y: y - 18, width: W - M * 2, height: 22, color: BAND });
  drawText(page, "Invoice Items", M + 10, y - 12, font, 10, INK);
  y -= 30;

  const colX = {
    desc: M,
    qty: W - M - 250,
    price: W - M - 170,
    total: W - M,
  };
  drawText(page, "Description", colX.desc, y, bold, 9, ACCENT);
  drawRight(page, "Qty", colX.qty + 30, y, bold, 9, INK);
  drawRight(page, "Rate", colX.price + 70, y, bold, 9, INK);
  drawRight(page, "Total", colX.total, y, bold, 9, INK);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: HAIRLINE });
  y -= 14;

  for (const it of items) {
    const amount = Number(it.quantity) * Number(it.rate);
    drawText(page, it.description, colX.desc, y, font, 9, INK);
    drawRight(page, Number(it.quantity).toFixed(2), colX.qty + 30, y, font, 9, INK);
    drawRight(page, eur(Number(it.rate)), colX.price + 70, y, font, 9, INK);
    drawRight(page, eur(amount), colX.total, y, font, 9, INK);
    y -= 16;
  }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: HAIRLINE });
  y -= 18;

  const labelRight = W - M - 110;
  drawRight(page, "Subtotal", labelRight, y, font, 9, MUTED);
  drawRight(page, eur(Number(invoice.subtotal)), W - M, y, font, 9, INK);
  y -= 16;
  drawRight(page, `IVA (${settings.vat_rate}%)`, labelRight, y, font, 9, MUTED);
  drawRight(page, eur(Number(invoice.vat_amount)), W - M, y, font, 9, INK);
  y -= 18;
  drawRight(page, "Total", labelRight, y, bold, 12, ACCENT);
  drawRight(page, eur(Number(invoice.total)), W - M, y, bold, 14, ACCENT);
  y -= 32;

  // PAYMENT INFO
  if (settings.iban || settings.bank_name) {
    page.drawRectangle({ x: M, y: y - 18, width: W - M * 2, height: 22, color: BAND });
    drawText(page, "Payment Details", M + 10, y - 12, font, 10, INK);
    y -= 30;
    if (settings.bank_name) {
      drawText(page, `Bank: ${settings.bank_name}`, M, y, font, 9, INK);
      y -= 14;
    }
    if (settings.iban) {
      drawText(page, `IBAN: ${settings.iban}`, M, y, font, 9, INK);
      y -= 14;
    }
  }

  if (settings.default_notes) {
    y -= 6;
    drawText(page, settings.default_notes, M, y, font, 9, MUTED);
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
