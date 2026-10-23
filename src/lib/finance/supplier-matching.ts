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

  // Merged suppliers stay inactive with their NIF; the active company wins.
  const { data, error } = await supabase
    .from("companies")
    .select("id, nome, nif, is_supplier")
    .eq("nif", nif)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as CompanyNifMatch;
  const { data: al } = await supabase.from("company_aliases").select("company_id").eq("alias_nif", nif).limit(1).maybeSingle();
  if (!al) return null;
  const { data: target } = await supabase.from("companies").select("id, nome, nif, is_supplier").eq("id", al.company_id).maybeSingle();
  return (target as CompanyNifMatch | null) ?? null;
}
