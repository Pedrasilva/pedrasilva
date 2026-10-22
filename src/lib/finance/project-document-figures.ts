import { isBilledDocument, billedSign } from './provisional-invoicing';

export interface ProjectDocument {
  id: string; direction: string; doc_type: string; status: string;
  sales_excluded?: boolean; project_id: string | null; subtotal_ex_vat: number | null;
}
export interface ProjectDocumentLine {
  document_id: string; project_id: string | null; amount_ex_vat: number | null;
}

/** Attribute every line once; header applies only to unattributed lines. */
export function documentProjectAmounts(doc: ProjectDocument, lines: ProjectDocumentLine[]) {
  const amounts = new Map<string, number>();
  const own = lines.filter(l => l.document_id === doc.id);
  for (const l of own) {
    const project = l.project_id ?? doc.project_id;
    if (project) amounts.set(project, (amounts.get(project) ?? 0) + Number(l.amount_ex_vat ?? 0));
  }
  if (!own.length && doc.project_id) amounts.set(doc.project_id, Number(doc.subtotal_ex_vat ?? 0));
  return amounts;
}

export function billedProjectAmounts(doc: ProjectDocument, lines: ProjectDocumentLine[]) {
  if (!isBilledDocument(doc)) return new Map<string, number>();
  return new Map([...documentProjectAmounts(doc, lines)].map(([pid, amount]) => [pid, amount * billedSign(doc)]));
}