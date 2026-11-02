import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
export { expenseClientAmount as expenseSale } from './expense-amounts';

export type FlowExpense = Database['public']['Tables']['pm_expenses']['Row'];
export type ExpenseFigure = Database['public']['Functions']['pe_expense_figures']['Returns'][number];
export type Choice = { id: string; name: string };
export type ExpenseDirectory = { projects: Choice[]; collaborators: Choice[]; accounts: Choice[]; cards: Choice[]; myCollaborator: string | null };

export async function expenseAction(action: string, data: Record<string, unknown>) {
  const result = await supabase.rpc('pe_action', { _action: action, _data: data as never });
  if (result.error) throw result.error;
  return result.data as { id: string };
}
export async function expenseDirectory(projectId?: string) {
  const result = await supabase.rpc('pe_directory', { _project: projectId });
  if (result.error) throw result.error;
  return result.data as unknown as ExpenseDirectory;
}
/** Called by every reconciliation surface before the ordinary payment path. */
export async function matchExpensePurchase(documentId: string, transactionId: string, eurDebit: number): Promise<boolean> {
  const doc = await supabase.from('financial_documents').select('project_expense_id').eq('id', documentId).single();
  if (doc.error) throw doc.error;
  if (!doc.data.project_expense_id) return false;
  const result = await supabase.rpc('pe_match_purchase', { _expense: doc.data.project_expense_id, _tx: transactionId, _amount: eurDebit });
  if (result.error) throw result.error;
  return true;
}