import { supabase } from "@/integrations/supabase/client";
import { normalizePortugueseNif, isValidPortugueseNif } from "./nif";

export type CompanyNifMatch = {
  id: string;
  nome: string;
  nif: string | null;
  is_supplier: boolean;
};

/**
 * Look up a company by exact normalized NIF match.
 * Phase A: exact match only — no fuzzy logic, no creation.
 */
export async function findCompanyByNif(rawNif: string | null | undefined): Promise<CompanyNifMatch | null> {
  const nif = normalizePortugueseNif(rawNif);
  if (!nif || !isValidPortugueseNif(nif)) return null;

  // Merged suppliers stay inactive with their NIF; an active company with the same NIF wins,
  // and a merged one resolves to the company it was merged into.
  const { data, error } = await supabase
    .from("companies")
    .select("id, nome, nif, is_supplier, is_active")
    .eq("nif", nif)
    .order("is_active", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const { is_active, ...hit } = data as CompanyNifMatch & { is_active: boolean };
  if (is_active) return hit;
  const { data: al } = await supabase.from("company_aliases").select("company_id").eq("source_company_id", hit.id).limit(1).maybeSingle();
  if (!al) return hit;
  const { data: target } = await supabase.from("companies").select("id, nome, nif, is_supplier").eq("id", al.company_id).maybeSingle();
  return (target as CompanyNifMatch | null) ?? hit;
}
