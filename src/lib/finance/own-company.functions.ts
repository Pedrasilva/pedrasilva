import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
    // Staff receipts are PSA's (benefit claims): PSA's own settings row.
    const { loadEntityIdentity } = await import("@/lib/finance/recipient-rule.server");
    const { PSA_ENTITY_ID } = await import("@/lib/finance/entity");
    const id = await loadEntityIdentity(PSA_ENTITY_ID);
    return { nif: normalizePortugueseNif(id.vat), name: id.name };
  });
