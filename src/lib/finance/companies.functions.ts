import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePortugueseNif, isValidPortugueseNif } from "@/lib/finance/nif";

export type CompanyRecord = {
  id: string;
  nome: string;
  nif: string | null;
  code: string | null;
  abbreviation: string | null;
  email: string | null;
  telefone: string | null;
  mobile: string | null;
  morada: string | null;
  postal_code: string | null;
  city: string | null;
  currency: string;
  payment_terms: string | null;
  is_client: boolean;
  is_supplier: boolean;
  is_active: boolean;
  is_reimbursement_supplier: boolean;
  notas: string | null;
};

const FILTER = z.object({
  role: z.enum(["supplier", "client", "any"]).default("any"),
  search: z.string().trim().max(255).optional(),
  active_only: z.boolean().default(true),
});

const UPSERT = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1).max(255),
  nif: z.string().trim().max(32).nullable().optional(),
  code: z.string().trim().max(32).nullable().optional(),
  abbreviation: z.string().trim().max(64).nullable().optional(),
  email: z.string().trim().max(255).nullable().optional(),
  telefone: z.string().trim().max(64).nullable().optional(),
  mobile: z.string().trim().max(64).nullable().optional(),
  morada: z.string().trim().max(500).nullable().optional(),
  postal_code: z.string().trim().max(32).nullable().optional(),
  city: z.string().trim().max(128).nullable().optional(),
  currency: z.string().trim().min(3).max(8).default("EUR"),
  payment_terms: z.string().trim().max(128).nullable().optional(),
  is_supplier: z.boolean().default(false),
  is_client: z.boolean().default(false),
  is_active: z.boolean().default(true),
  notas: z.string().trim().max(2000).nullable().optional(),
});

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!data) throw new Response("Forbidden: admin required", { status: 403 });
}

async function getOwnCompanyNif(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("pm_invoice_settings")
    .select("company_nif")
    .order("singleton", { ascending: false })
    .limit(1)
    .maybeSingle();
  return normalizePortugueseNif(data?.company_nif ?? null);
}

export const listCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FILTER.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CompanyRecord[]> => {
    await requireAdmin(context.userId);
    let q = supabaseAdmin
      .from("companies")
      .select(
        "id, nome, nif, code, abbreviation, email, telefone, mobile, morada, postal_code, city, currency, payment_terms, is_client, is_supplier, is_active, is_reimbursement_supplier, notas",
      )
      .order("nome");
    if (data.role === "supplier") q = q.eq("is_supplier", true);
    if (data.role === "client") q = q.eq("is_client", true);
    if (data.active_only) q = q.eq("is_active", true);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "");
      q = q.or(`nome.ilike.%${s}%,nif.ilike.%${s}%,code.ilike.%${s}%`);
    }
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Response(error.message, { status: 500 });
    return (rows ?? []) as CompanyRecord[];
  });

export const getCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CompanyRecord | null> => {
    await requireAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("companies")
      .select(
        "id, nome, nif, code, abbreviation, email, telefone, mobile, morada, postal_code, city, currency, payment_terms, is_client, is_supplier, is_active, is_reimbursement_supplier, notas",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Response(error.message, { status: 500 });
    return (row ?? null) as CompanyRecord | null;
  });

export const upsertCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UPSERT.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; created: boolean }> => {
    await requireAdmin(context.userId);

    let normalizedNif: string | null = null;
    if (data.nif) {
      normalizedNif = normalizePortugueseNif(data.nif);
      if (!normalizedNif || !isValidPortugueseNif(normalizedNif)) {
        throw new Response("Invalid Portuguese NIF", { status: 400 });
      }
      const ownNif = await getOwnCompanyNif();
      if (ownNif && ownNif === normalizedNif && data.is_supplier) {
        throw new Response("Refusing to flag own-company NIF as a supplier", { status: 400 });
      }
    }

    const payload = {
      nome: data.nome.trim(),
      nif: normalizedNif,
      code: data.code?.trim() || null,
      abbreviation: data.abbreviation?.trim() || null,
      email: data.email?.trim() || null,
      telefone: data.telefone?.trim() || null,
      mobile: data.mobile?.trim() || null,
      morada: data.morada?.trim() || null,
      postal_code: data.postal_code?.trim() || null,
      city: data.city?.trim() || null,
      currency: data.currency.trim().toUpperCase(),
      payment_terms: data.payment_terms?.trim() || null,
      is_supplier: data.is_supplier,
      is_client: data.is_client,
      is_active: data.is_active,
      notas: data.notas?.trim() || null,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("companies")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Response(error.message, { status: 500 });
      return { id: data.id, created: false };
    }

    // Insert path — NIF uniqueness is already enforced by partial unique index
    const { data: inserted, error } = await supabaseAdmin
      .from("companies")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Response(`Failed to create company: ${error?.message ?? "unknown"}`, { status: 500 });
    }
    return { id: inserted.id, created: true };
  });

/**
 * Admin merge: move all references from `from_id` to `into_id`, then delete
 * `from_id`. Used to fix accidental duplicates (e.g. same supplier created
 * twice without NIF). Read-only references are NOT moved — only the foreign
 * keys that point at companies.
 */
export const mergeCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from_id: z.string().uuid(),
        into_id: z.string().uuid(),
      })
      .refine((v) => v.from_id !== v.into_id, "from_id and into_id must differ")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);

    const moves: Array<{ table: string; column: string }> = [
      { table: "financial_documents", column: "counterparty_supplier_id" },
      { table: "financial_documents", column: "counterparty_client_id" },
      { table: "financial_expense_items", column: "supplier_id" },
      { table: "financial_income_items", column: "client_id" },
      { table: "bank_transaction_classifications", column: "supplier_id" },
      { table: "bank_transaction_classifications", column: "client_id" },
      { table: "benefit_expenses", column: "supplier_company_id" },
      { table: "pm_expenses", column: "supplier_company_id" },
      { table: "pm_materials", column: "supplier_company_id" },
      { table: "company_expenses", column: "supplier_company_id" },
      { table: "quote_external_services", column: "supplier_company_id" },
      { table: "crm_accounts", column: "company_id" },
      { table: "crm_opportunities", column: "company_id" },
      { table: "contacts", column: "company_id" },
      { table: "fee_proposals", column: "company_id" },
      { table: "projects", column: "company_id" },
      { table: "pm_projects", column: "company_id" },
      { table: "historical_time_entries", column: "company_id" },
    ];

    // Typed table names are constrained by the generated types — dynamic
    // table iteration needs an untyped escape hatch. Each entry above is a
    // real column that points at companies(id); the loop is admin-only.
    const adminAny = supabaseAdmin as unknown as {
      from: (table: string) => {
        update: (values: Record<string, string>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    for (const m of moves) {
      const { error } = await adminAny
        .from(m.table)
        .update({ [m.column]: data.into_id })
        .eq(m.column, data.from_id);
      if (error) {
        throw new Response(`Failed to move ${m.table}.${m.column}: ${error.message}`, { status: 500 });
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from("companies")
      .delete()
      .eq("id", data.from_id);
    if (delErr) throw new Response(`Failed to delete merged company: ${delErr.message}`, { status: 500 });

    return { ok: true, merged_into: data.into_id };
  });
