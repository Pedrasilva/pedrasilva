/**
 * Company-level (generic) expenses — rent, software, admin, etc.
 *
 * OWNERSHIP MODEL
 * ---------------
 * Every financial record in the system belongs to EITHER a project OR the
 * company, never both:
 *
 *   - Project-owned : pm_materials, pm_expenses, pm_invoices, rate overrides.
 *                     `project_id` is REQUIRED.
 *   - Company-owned : company_expenses (this hook). No `project_id` column.
 *
 * Project dashboards must NEVER read from `company_expenses`, and project
 * queries must always filter by the current `project_id`. This keeps margins,
 * billing and reporting unambiguous.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Supplier } from "@/lib/projects/use-suppliers";

export type CompanyExpenseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "paid";

export type CompanyExpenseCategory =
  | "travel"
  | "accommodation"
  | "food"
  | "transport"
  | "printing"
  | "misc";

export interface CompanyExpense {
  id: string;
  description: string;
  category: CompanyExpenseCategory;
  supplier_id: string | null;
  vendor: string | null;
  amount: number;
  incurred_at: string | null;
  paid_at: string | null;
  status: CompanyExpenseStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CompanyExpenseWithSupplier = CompanyExpense & {
  supplier: Pick<Supplier, "id" | "name" | "active"> | null;
};

export type CompanyExpenseInsert = Omit<
  CompanyExpense,
  "id" | "created_at" | "updated_at"
> & { id?: string };

export type CompanyExpenseUpdate = Partial<CompanyExpenseInsert> & {
  id: string;
};

// New table — not yet in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const COMPANY_EXPENSE_STATUSES: CompanyExpenseStatus[] = [
  "draft",
  "submitted",
  "approved",
  "paid",
];

export const COMPANY_EXPENSE_CATEGORIES: CompanyExpenseCategory[] = [
  "travel",
  "accommodation",
  "food",
  "transport",
  "printing",
  "misc",
];

export function useCompanyExpenses() {
  return useQuery({
    queryKey: ["company-expenses"],
    queryFn: async (): Promise<CompanyExpenseWithSupplier[]> => {
      const { data, error } = await db
        .from("company_expenses")
        .select("*, supplier:pm_suppliers(id,name,active)")
        .order("incurred_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyExpenseWithSupplier[];
    },
  });
}

export function useUpsertCompanyExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompanyExpenseInsert | CompanyExpenseUpdate) => {
      if ((input as CompanyExpenseUpdate).id) {
        const { id, ...rest } = input as CompanyExpenseUpdate;
        const { data, error } = await db
          .from("company_expenses")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await db
        .from("company_expenses")
        .insert(input as CompanyExpenseInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-expenses"] });
    },
  });
}

export function useDeleteCompanyExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("company_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-expenses"] });
    },
  });
}
