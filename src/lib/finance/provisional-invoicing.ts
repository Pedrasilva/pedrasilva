export type FiscalIdentity = { type: string | null; series: string | null; number: string | null };

export function fiscalIdentity(docType: string, text: string | null, series?: string | null): FiscalIdentity {
  const s = (text ?? '').trim().toUpperCase();
  const type = docType === 'client_invoice' ? 'FT' : docType === 'client_credit_note' ? 'NC' : null;
  const reversed = s.match(/^(FT|NC|R|RECIBO)\s+N[º°O.]?\s*(\d+)\/(\d{4})$/);
  if (reversed) return { type, series: reversed[3] ?? null, number: reversed[2] ?? null };
  const standard = s.match(/^(FT|NC|R)\s+([^/\s]+)\/(\d+)$/);
  if (standard) return { type, series: standard[2] ?? null, number: standard[3] ?? null };
  const receipt = s.match(/^(R|RECIBO)\s+N[º°O.]?\s*(\d+)$/);
  return { type, series: series?.trim().toUpperCase() || null, number: receipt?.[2] ?? (/^\d+$/.test(s) ? s : null) };
}

export function isBilledDocument(d: { direction: string; doc_type: string; status: string; sales_excluded?: boolean }) {
  return d.direction === 'issued' && !d.sales_excluded && ['client_invoice', 'client_credit_note'].includes(d.doc_type) && !['draft', 'cancelled'].includes(d.status);
}
export function billedSign(d: { doc_type: string }) { return d.doc_type === 'client_credit_note' ? -1 : 1; }

export type SaftDocument = {
  number: string; fiscalType: string; series: string; sequence: string; date: string;
  clientTaxId: string; clientName: string; net: number; vat: number; gross: number;
  cancelled: boolean; originalNumber: string | null;
  lines: { description: string; net: number; vat: number }[];
};

/** Browser-native XML parsing; reject entity definitions, unsupported fiscal types and invalid totals. */
export function parseSaft(xml: string): { issuerTaxId: string; documents: SaftDocument[] } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('unsafeXml');
  const root = new DOMParser().parseFromString(xml, 'application/xml');
  if (root.getElementsByTagName('parsererror').length) throw new Error('invalidXml');
  const children = (el: Element, name: string) => Array.from(el.children).filter(c => c.localName === name);
  const child = (el: Element, name: string) => children(el, name)[0];
  const text = (el: Element, name: string) => child(el, name)?.textContent?.trim() ?? '';
  const header = child(root.documentElement, 'Header');
  const masters = child(root.documentElement, 'MasterFiles');
  const source = child(root.documentElement, 'SourceDocuments');
  const sales = source && child(source, 'SalesInvoices');
  if (!header || !masters || !sales) throw new Error('invalidXml');
  const clients = new Map(children(masters, 'Customer').map(c => [text(c, 'CustomerID'), { tax: text(c, 'CustomerTaxID'), name: text(c, 'CompanyName') }]));
  const documents = children(sales, 'Invoice').map((invoice): SaftDocument => {
    const number = text(invoice, 'InvoiceNo');
    const fiscalType = text(invoice, 'InvoiceType');
    const match = number.match(/^(FT|FR|FS|NC|ND)\s+([^/\s]+)\/(\d+)$/);
    if (!match || match[1] !== fiscalType || !['FT','FR','FS','NC'].includes(fiscalType)) throw new Error('unsupportedFiscalType');
    const totals = child(invoice, 'DocumentTotals');
    if (!totals) throw new Error('invalidTotals');
    const net = Number(text(totals, 'NetTotal')), vat = Number(text(totals, 'TaxPayable')), gross = Number(text(totals, 'GrossTotal'));
    if (![net, vat, gross].every(n => Number.isFinite(n) && n >= 0) || Math.abs(net + vat - gross) > .02) throw new Error('invalidTotals');
    const customer = clients.get(text(invoice, 'CustomerID'));
    if (!customer) throw new Error('missingClient');
    const date = text(invoice, 'InvoiceDate');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalidDate');
    const lineElements = children(invoice, 'Line');
    const lines = lineElements.map(line => {
      const amount = Number(text(line, fiscalType === 'NC' ? 'DebitAmount' : 'CreditAmount'));
      const tax = child(line, 'Tax');
      const percentage = tax ? Number(text(tax, 'TaxPercentage')) : 0;
      return { description: text(line, 'Description') || number, net: amount, vat: Math.round(amount * percentage) / 100 };
    });
    if (!lines.length || lines.some(l => !Number.isFinite(l.net) || l.net < 0) || Math.abs(lines.reduce((a,l)=>a+l.net,0)-net) > .02) throw new Error('unsupportedDiscounts');
    // Allocate the XML's authoritative TaxPayable rounding across lines without changing the document total.
    const lineVat = lines.reduce((a,l)=>a+l.vat,0);
    const last = lines[lines.length-1];
    if (last) last.vat = Math.round((last.vat + vat - lineVat)*100)/100;
    const references = lineElements.flatMap(l => children(l,'References').map(r => text(r,'Reference'))).filter(Boolean);
    const status = child(invoice, 'DocumentStatus');
    return { number, fiscalType, series: match[2] ?? '', sequence: match[3] ?? '', date,
      clientTaxId: customer.tax, clientName: customer.name, net, vat, gross,
      cancelled: !!status && text(status,'InvoiceStatus') === 'A',
      originalNumber: references.length && new Set(references).size === 1 ? references[0] ?? null : null, lines };
  });
  if (documents.length > 500) throw new Error('tooManyDocuments');
  if (new Set(documents.map(d=>d.number)).size!==documents.length) throw new Error('invalidXml');
  return { issuerTaxId: text(header, 'TaxRegistrationNumber'), documents };
}