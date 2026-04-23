/**
 * Suppliers (vendor directory) shared by External services and Expenses.
 *
 * Lightweight on purpose — no procurement workflow, just a clean lookup
 * with create / edit / archive support. Most callers want
 * `useActiveSuppliers()` which hides archived entries; the management UI
 * uses `useSuppliers({ includeInactive: true })`.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Cast through `any` because the freshly-created `pm_suppliers` table is
// not yet present in the generated `Database` types. The runtime contract
// is stable; types regen on the next deploy.
type AnyDb = Database & {
  public: {
    Tables: {
      pm_suppliers: {
        Row: {
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
        };
        Insert: Partial<AnyDb["public"]["Tables"]["pm_suppliers"]["Row"]> & {
          name: string;
        };
        Update: Partial<AnyDb["public"]["Tables"]["pm_suppliers"]["Row"]>;
      };
    };
  };
};

export type Supplier = AnyDb["public"]["Tables"]["pm_suppliers"]["Row"];
export type SupplierInsert = AnyDb["public"]["Tables"]["pm_suppliers"]["Insert"];
export type SupplierUpdate = AnyDb["public"]["Tables"]["pm_suppliers"]["Update"];

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

// -- queries --------------------------------------------------------------

const supabaseAny = supabase as unknown as ReturnType<typeof getTypedClient>;
function getTypedClient() {
  // helper purely for TS — never called at runtime
  return supabase as unknown as {
    from: (
      table: "pm_suppliers",
    ) => ReturnType<typeof supabase.from<"benefit_balances">>;
  };
}

interface UseSuppliersOpts {
  includeInactive?: boolean;
}

export function useSuppliers(opts: UseSuppliersOpts = {}) {
  const { includeInactive = false } = opts;
  return useQuery({
    queryKey: ["pm-suppliers", { includeInactive }],
    queryFn: async () => {
      let query = (supabase as never as typeof supabaseAny)
        .from("pm_suppliers")
        .select("*")
        .order("name", { ascending: true });
      if (!includeInactive) {
        query = (query as unknown as { eq: (c: string, v: boolean) => typeof query }).eq(
          "active",
          true,
        );
      }
      const { data, error } = (await query) as unknown as {
        data: Supplier[] | null;
        error: { message: string } | null;
      };
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
      const client = supabase as never as typeof supabaseAny;
      if (input.id) {
        const { id, ...rest } = input as SupplierUpdate & { id: string };
        const { data, error } = (await (client.from("pm_suppliers") as never as {
          update: (v: SupplierUpdate) => {
            eq: (c: string, v: string) => {
              select: () => { single: () => Promise<{ data: Supplier; error: { message: string } | null }> };
            };
          };
        })
          .update(rest)
          .eq("id", id)
          .select()
          .single()) as unknown as { data: Supplier; error: { message: string } | null };
        if (error) throw new Error(error.message);
        return data;
      }
      const { data, error } = (await (client.from("pm_suppliers") as never as {
        insert: (v: SupplierInsert) => {
          select: () => { single: () => Promise<{ data: Supplier; error: { message: string } | null }> };
        };
      })
        .insert(input as SupplierInsert)
        .select()
        .single()) as unknown as { data: Supplier; error: { message: string } | null };
      if (error) throw new Error(error.message);
      return data;
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
      const client = supabase as never as typeof supabaseAny;
      const { error } = (await (client.from("pm_suppliers") as never as {
        update: (v: { active: boolean }) => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      })
        .update({ active })
        .eq("id", id)) as unknown as { error: { message: string } | null };
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
      const client = supabase as never as typeof supabaseAny;
      const { error } = (await (client.from("pm_suppliers") as never as {
        delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
      })
        .delete()
        .eq("id", id)) as unknown as { error: { message: string } | null };
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
