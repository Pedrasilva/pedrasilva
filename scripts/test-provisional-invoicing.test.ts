import { describe, it, expect } from 'vitest';
import { fiscalIdentity, isBilledDocument, billedSign, parseSaft } from '../src/lib/finance/provisional-invoicing';
import { isConfirmableIssuedPdf } from '../src/lib/finance/issued-pdf';
describe('approved fiscal identity rules', () => {
  it('permits extracted issued invoices only while awaiting human confirmation',()=>{
    expect(isConfirmableIssuedPdf({direction:'issued',intake_type:'fatura_emitida',status:'pending_review'})).toBe(true);
    expect(isConfirmableIssuedPdf({direction:'issued',intake_type:'fatura_emitida',status:'duplicate'})).toBe(false);
    expect(isConfirmableIssuedPdf({direction:'issued',intake_type:'fatura_emitida',status:'filed'})).toBe(false);
  });
  it('refuses purchase PDFs from issued-invoice confirmation',()=>{
    expect(isConfirmableIssuedPdf({direction:'received',intake_type:'fatura_compra',status:'pending_review'})).toBe(false);
    expect(isConfirmableIssuedPdf({direction:'received',intake_type:'nota_credito',status:'pending_review'})).toBe(false);
  });
  it('rejects XML entity definitions before parsing',()=>{
    expect(()=>parseSaft('<!DOCTYPE AuditFile [<!ENTITY external SYSTEM "file:///secret">]><AuditFile/>')).toThrow('unsafeXml');
  });
  it('normalizes the approved reversed FT without changing the sequence', () => {
    expect(fiscalIdentity('client_invoice','FT Nº12/2026')).toEqual({type:'FT',series:'2026',number:'12'});
  });
  it('preserves the suspected 2024 typo', () => {
    expect(fiscalIdentity('client_invoice','FT 2026/2024').number).toBe('2024');
  });
  it('does not invent a series for 000', () => {
    expect(fiscalIdentity('client_invoice','000')).toEqual({type:'FT',series:null,number:'000'});
  });
  it('does not guess receipt fiscal codes', () => {
    expect(fiscalIdentity('receipt','Recibo Nº12/2026')).toEqual({type:null,series:'2026',number:'12'});
    expect(fiscalIdentity('receipt','R 2026/16').type).toBeNull();
  });
  it('receipts never count as billed', () => {
    expect(isBilledDocument({direction:'issued',doc_type:'receipt',status:'paid'})).toBe(false);
  });
  it('excluded non-sales invoices do not count as billed', () => {
    expect(isBilledDocument({direction:'issued',doc_type:'client_invoice',status:'issued',sales_excluded:true})).toBe(false);
  });
  it('cancelled and draft invoices never count as billed', () => {
    for (const status of ['cancelled','draft']) expect(isBilledDocument({direction:'issued',doc_type:'client_invoice',status})).toBe(false);
    expect(isBilledDocument({direction:'issued',doc_type:'client_invoice',status:'issued'})).toBe(true);
  });
  it('credit notes deduct instead of adding billed amounts', () => {
    expect(billedSign({doc_type:'client_credit_note'})).toBe(-1);
  });
});