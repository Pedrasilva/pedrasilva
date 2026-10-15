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

// ---- Optional approval (pm_expense_request_approval / pm_expense_decide_approval) ----

export type ApprovalState = "not_required" | "pending" | "approved" | "rejected";

/** Billable rule: approval never required, but if requested it must be granted. Mirrors idx_pm_expenses_ready_to_invoice. */
export function isReadyToInvoice(e: ProjectExpense): boolean {
  const st = ((e as { approval_state?: string }).approval_state ?? "not_required") as ApprovalState;
  return (
    !!e.rebillable &&
    !e.invoiced_at &&
    (e.status === "submitted" || e.status === "approved" || e.status === "paid") &&
    (st === "not_required" || st === "approved")
  );
}

export function canRequestApproval(e: ProjectExpense): boolean {
  const st = (e as { approval_state?: string }).approval_state;
  return e.status !== "approved" && e.status !== "paid" && !e.invoiced_at && st !== "approved";
}

function invalidate(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: ["project-expenses", projectId] });
  qc.invalidateQueries({ queryKey: ["project-insights", projectId] });
}

export function useRequestExpenseApproval(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { expenseId: string; approverId: string }) => {
      const { data, error } = await db.rpc("pm_expense_request_approval", {
        p_expense_id: v.expenseId,
        p_approver: v.approverId,
      });
      if (error) throw error;
      return data as { notified: boolean; approver_name: string };
    },
    onSuccess: () => invalidate(qc, projectId),
  });
}

export function useDecideExpenseApproval(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { expenseId: string; approve: boolean; note?: string }) => {
      const { error } = await db.rpc("pm_expense_decide_approval", {
        p_expense_id: v.expenseId,
        p_approve: v.approve,
        p_note: v.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, projectId),
  });
}
