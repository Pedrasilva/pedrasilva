import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProjectExpense = Database["public"]["Tables"]["pm_expenses"]["Row"];
export type ProjectExpenseInsert =
  Database["public"]["Tables"]["pm_expenses"]["Insert"];
export type ProjectExpenseUpdate =
  Database["public"]["Tables"]["pm_expenses"]["Update"];

export type ExpenseStatus = Database["public"]["Enums"]["pm_expense_status"];
export type ExpenseCategory = Database["public"]["Enums"]["pm_expense_category"];

export const EXPENSE_STATUSES: ExpenseStatus[] = [
  "draft",
  "submitted",
  "approved",
  "paid",
];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "travel",
  "accommodation",
  "food",
  "transport",
  "printing",
  "misc",
];

export function useProjectExpenses(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-expenses", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_expenses")
        .select("*")
        .eq("project_id", projectId!)
        .order("incurred_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectExpense[];
    },
  });
}

export function useUpsertProjectExpense(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectExpenseInsert | ProjectExpenseUpdate) => {
      if ((input as ProjectExpenseUpdate).id) {
        const { id, ...rest } = input as ProjectExpenseUpdate & { id: string };
        const { data, error } = await supabase
          .from("pm_expenses")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("pm_expenses")
        .insert({ ...(input as ProjectExpenseInsert), project_id: projectId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-expenses", projectId] });
      qc.invalidateQueries({ queryKey: ["project-insights", projectId] });
    },
  });
}

export function useDeleteProjectExpense(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-expenses", projectId] });
      qc.invalidateQueries({ queryKey: ["project-insights", projectId] });
    },
  });
}
