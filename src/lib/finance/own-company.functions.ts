import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePortugueseNif } from "./nif";

/**
 * Returns the canonical "own company" NIF used by this PSA installation.
 *
 * Source of truth: `pm_invoice_settings.company_nif` on the singleton row
 * (`singleton = true`). Falls back to the first row if no explicit
 * singleton flag is set. Returns null if not configured — callers should
 * gracefully skip own-company detection in that case.
 *
 * Why a server fn: `pm_invoice_settings` is admin-RLS-only, but every
 * authenticated collaborator submitting a receipt needs to know whether
 * the OCR-extracted NIF accidentally matches the buyer (own company)
 * instead of the supplier.
 */
export const getOwnCompanyNif = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ nif: string | null; name: string | null }> => {
    const { data, error } = await supabaseAdmin
      .from("pm_invoice_settings")
      .select("company_nif, company_name, singleton")
      .order("singleton", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { nif: null, name: null };
    return {
      nif: normalizePortugueseNif(data.company_nif),
      name: data.company_name ?? null,
    };
  });
