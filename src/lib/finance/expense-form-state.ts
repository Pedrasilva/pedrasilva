import type { FlowExpense } from './project-expense-flow';

export type ExpenseIntake = { id: string; supplier: string | null; documentNumber: string | null; date: string | null; currency: string | null; amount: number | null; path: string | null };

/** One reset transaction: receipt evidence overlays defaults, never vice versa. */
export function expenseFormValues(initial?: FlowExpense | null, projectId?: string, intake?: ExpenseIntake, today = new Date().toISOString().slice(0, 10)): Record<string, string> {
  const values = { projectId: initial?.project_id ?? projectId ?? '', description: initial?.description ?? '', category: initial?.category ?? 'travel', date: initial?.incurred_at ?? today, supplier: initial?.vendor ?? '', documentNumber: initial?.document_number ?? '', currency: initial?.original_currency ?? 'EUR', originalAmount: initial?.original_amount?.toString() ?? '', eurAmount: initial?.eur_amount?.toString() ?? '', exchangeDate: initial?.exchange_rate_date ?? '', exchangeSource: initial?.exchange_rate_source ?? '', exchangeEvidence: initial?.exchange_evidence ? JSON.stringify(initial.exchange_evidence) : '', paidBy: initial?.payment_source_type ?? 'personal', collaboratorId: initial?.reimburse_collaborator_id ?? '', cardId: initial?.payment_card_id ?? '', accountId: initial?.paid_from_account_id ?? '', rebillMode: initial?.rebill_mode ?? 'cost', markupPct: initial?.markup_pct?.toString() ?? '0', taxTreatment: initial?.tax_treatment ?? 'pending', vatRate: String((initial?.tax_parameters as { vatRate?: number } | null)?.vatRate ?? ''), notes: initial?.notes ?? '', receiptPath: initial?.receipt_path ?? '' };
  if (!intake) return values;
  return { ...values, supplier: intake.supplier ?? values.supplier, description: initial?.description ?? [intake.supplier, intake.documentNumber].filter(Boolean).join(' · '), documentNumber: intake.documentNumber ?? values.documentNumber, date: intake.date ?? values.date, currency: intake.currency ?? values.currency, originalAmount: intake.amount?.toString() ?? values.originalAmount, receiptPath: intake.path ?? values.receiptPath };
}

/** File identity is scoped to a project; no cross-project receipt reuse. */
export class ExpenseReceiptFiles {
  private files = new WeakMap<File, Map<string, { path: string; hash: string }>>();
  get(file: File, projectId: string) { return this.files.get(file)?.get(projectId); }
  remember(file: File, projectId: string, receipt: { path: string; hash: string }) {
    const projects = this.files.get(file) ?? new Map();
    projects.set(projectId, receipt);
    this.files.set(file, projects);
  }
}