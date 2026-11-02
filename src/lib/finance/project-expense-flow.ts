import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

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
export function expenseSale(cost: number | null, mode: string | null, markup: number | null): number | null {
  if (cost === null) return null;
  return mode === 'none' ? 0 : Math.round(cost * (mode === 'markup' ? 1 + (markup ?? 0) / 100 : 1) * 100) / 100;
}