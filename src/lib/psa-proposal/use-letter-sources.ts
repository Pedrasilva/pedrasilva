import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LetterSources } from './letter-fields';

export async function loadLetterSources(quoteId: string | null): Promise<LetterSources> {
  if (!quoteId) return {};
  const { data: q, error } = await supabase.from('fee_proposals').select('company_id,contact_id').eq('id', quoteId).single();
  if (error) throw error;
  const [company, contact] = await Promise.all([
    q.company_id ? supabase.from('companies').select('nome,morada,postal_code,city').eq('id', q.company_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    q.contact_id ? supabase.from('contacts').select('primeiro_nome,apelido,titulo,posicao').eq('id', q.contact_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (company.error) throw company.error;
  if (contact.error) throw contact.error;
  return { company: company.data, contact: contact.data };
}

export function useLetterSources(quoteId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['proposal-letter-sources', quoteId], enabled: !!quoteId && enabled,
    queryFn: () => loadLetterSources(quoteId),
  });
}