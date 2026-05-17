import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePortugueseNif, isValidPortugueseNif } from "@/lib/finance/nif";

export type LinkOrCreateSupplierResult = {
  ok: true;
  company_id: string;
  company_name: string;
  created: boolean;
};

/**
 * Admin / benefits-approver only.
 *
 * Idempotently link the canonical Finance supplier (`companies` row) to an
 * HR benefit expense. If a company with this NIF already exists, link it.
 * Otherwise create it as `is_supplier = true` and link it.
 *
 * The supplier DB is intentionally the same `companies` table used by
 * Finance — no HR-only supplier table, no `pm_suppliers`. New suppliers
 * created from HR will show up in Finance pickers automatically.
 */
export const linkOrCreateSupplierForBenefitExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        expense_id: z.string().uuid(),
        nif: z.string().min(1).max(32),
        name: z.string().trim().min(1).max(255),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<LinkOrCreateSupplierResult> => {
    const { userId } = context;

    // Permission check: admin OR explicit benefits approver (RPC or perm).
    const [{ data: isAdmin }, { data: canApprove }] = await Promise.all([
      supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabaseAdmin.rpc("can_approve_benefits", { _user_id: userId }),
    ]);
    if (!isAdmin && !canApprove) {
      throw new Response("Forbidden: admin or benefits approver required", { status: 403 });
    }

    const nif = normalizePortugueseNif(data.nif);
    if (!nif || !isValidPortugueseNif(nif)) {
      throw new Response("Invalid Portuguese NIF", { status: 400 });
    }

    // Guard: refuse to create a supplier matching the buyer (own company).
    const { data: settings } = await supabaseAdmin
      .from("pm_invoice_settings")
      .select("company_nif")
      .order("singleton", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ownNif = normalizePortugueseNif(settings?.company_nif ?? null);
    if (ownNif && ownNif === nif) {
      throw new Response("Refusing to create supplier for own-company NIF", { status: 400 });
    }

    // Look up existing company by NIF (canonical Finance table).
    const { data: existing } = await supabaseAdmin
      .from("companies")
      .select("id, nome, is_supplier")
      .eq("nif", nif)
      .maybeSingle();

    let companyId: string;
    let companyName: string;
    let created = false;

    if (existing) {
      companyId = existing.id;
      companyName = existing.nome;
      // Make sure it's flagged as supplier — Finance pickers filter by this.
      if (!existing.is_supplier) {
        await supabaseAdmin
          .from("companies")
          .update({ is_supplier: true })
          .eq("id", companyId);
      }
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("companies")
        .insert({
          nome: data.name.trim(),
          nif,
          is_supplier: true,
          is_active: true,
          created_by: userId,
        })
        .select("id, nome")
        .single();
      if (insErr || !inserted) {
        throw new Response(`Failed to create supplier: ${insErr?.message ?? "unknown"}`, { status: 500 });
      }
      companyId = inserted.id;
      companyName = inserted.nome;
      created = true;
    }

    // Link the benefit expense to the canonical company.
    const { error: linkErr } = await supabaseAdmin
      .from("benefit_expenses")
      .update({ supplier_company_id: companyId })
      .eq("id", data.expense_id);
    if (linkErr) {
      throw new Response(`Failed to link expense: ${linkErr.message}`, { status: 500 });
    }

    return { ok: true, company_id: companyId, company_name: companyName, created };
  });
