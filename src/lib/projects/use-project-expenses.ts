import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Supplier } from "@/lib/projects/use-suppliers";
import { assertProjectOwned } from "@/lib/finance/ownership";

export type ProjectExpense = Database["public"]["Tables"]["pm_expenses"]["Row"] & {
  // Newly added supplier link + legacy mirror columns. Not yet in generated types.
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_contact?: string | null;
};
export type ProjectExpenseInsert =
  Database["public"]["Tables"]["pm_expenses"]["Insert"] & {
    supplier_id?: string | null;
    supplier_name?: string | null;
    supplier_contact?: string | null;
  };
export type ProjectExpenseUpdate =
  Database["public"]["Tables"]["pm_expenses"]["Update"] & {
    supplier_id?: string | null;
    supplier_name?: string | null;
    supplier_contact?: string | null;
  };

export type ProjectExpenseWithSupplier = ProjectExpense & {
  supplier: Pick<Supplier, "id" | "name" | "active"> | null;
};

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useProjectExpenses(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-expenses", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectExpenseWithSupplier[]> => {
      const { data, error } = await db
        .from("pm_expenses")
        .select("*, supplier:pm_suppliers(id,name,active)")
        .eq("project_id", projectId!)
        .order("incurred_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectExpenseWithSupplier[];
    },
  });
}

export function useUpsertProjectExpense(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectExpenseInsert | ProjectExpenseUpdate) => {
      // Ownership rule: project expenses MUST be tied to a project.
      // Use useUpsertCompanyExpense for generic company costs.
      assertProjectOwned(projectId);
      if ((input as ProjectExpenseUpdate).id) {
        const { id, ...rest } = input as ProjectExpenseUpdate & { id: string };
        const { data, error } = await db
          .from("pm_expenses")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await db
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
