/**
 * Suppliers (vendor directory) shared by External services and Expenses.
 *
 * Lightweight on purpose — no procurement workflow, just a clean lookup
 * with create / edit / archive support. Most callers want
 * `useActiveSuppliers()` which hides archived entries; the management UI
 * uses `useSuppliers({ includeInactive: true })`.
 *
 * The `pm_suppliers` table is freshly created and not yet present in the
 * generated `Database` types, so we cast the client locally to keep the
 * rest of the codebase strictly typed. Types regen on the next deploy.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type SupplierInsert = Partial<Supplier> & { name: string };
export type SupplierUpdate = Partial<Supplier>;

// -- validation -----------------------------------------------------------

export const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "nameRequired" })
    .max(200, { message: "nameTooLong" }),
  contact_name: z.string().trim().max(200).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email({ message: "invalidEmail" })
    .or(z.literal(""))
    .optional()
    .nullable(),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  tax_id: z.string().trim().max(60).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  active: z.boolean(),
});
export type SupplierFormInput = z.infer<typeof supplierSchema>;

// -- typed escape hatch ---------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// -- queries --------------------------------------------------------------

interface UseSuppliersOpts {
  includeInactive?: boolean;
}

export function useSuppliers(opts: UseSuppliersOpts = {}) {
  const { includeInactive = false } = opts;
  return useQuery({
    queryKey: ["pm-suppliers", { includeInactive }],
    queryFn: async (): Promise<Supplier[]> => {
      let query = db
        .from("pm_suppliers")
        .select("*")
        .order("name", { ascending: true });
      if (!includeInactive) {
        query = query.eq("active", true);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Supplier[];
    },
  });
}

/** Convenience for forms — only active suppliers, sorted alphabetically. */
export function useActiveSuppliers() {
  return useSuppliers({ includeInactive: false });
}

// -- mutations ------------------------------------------------------------

export function useUpsertSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: (SupplierInsert | SupplierUpdate) & { id?: string },
    ): Promise<Supplier> => {
      if (input.id) {
        const { id, ...rest } = input as SupplierUpdate & { id: string };
        const { data, error } = await db
          .from("pm_suppliers")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as Supplier;
      }
      const { data, error } = await db
        .from("pm_suppliers")
        .insert(input)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Supplier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-suppliers"] });
    },
  });
}

export function useArchiveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await db
        .from("pm_suppliers")
        .update({ active })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-suppliers"] });
    },
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("pm_suppliers").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-suppliers"] });
    },
  });
}

// -- legacy fallback helper ----------------------------------------------

/**
 * Resolve the display name for a record that may reference a supplier OR
 * carry legacy free-text. Always prefer the linked supplier when present.
 */
export function resolveSupplierLabel(
  linked: { name: string } | null | undefined,
  legacyName: string | null | undefined,
): string {
  if (linked?.name) return linked.name;
  if (legacyName && legacyName.trim().length > 0) return legacyName;
  return "—";
}
