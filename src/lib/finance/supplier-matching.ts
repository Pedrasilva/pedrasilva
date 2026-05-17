import { supabase } from "@/integrations/supabase/client";
import { normalizePortugueseNif } from "./nif";

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
  if (!nif) return null;

  const { data, error } = await supabase
    .from("companies")
    .select("id, nome, nif, is_supplier")
    .eq("nif", nif)
    .maybeSingle();

  if (error) throw error;
  return (data as CompanyNifMatch | null) ?? null;
}
