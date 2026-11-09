import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { resolveMaster, validMaster, type MasterPage } from './master-page';

export function useMasterDefault() {
  return useQuery({ queryKey: ['psa-master-default'], queryFn: async () => {
    const { data, error } = await supabase.from('psa_master_page_defaults').select('template, revision').eq('id', true).maybeSingle();
    if (error) throw error;
    return { template: data ? data.template as unknown as MasterPage : resolveMaster(), revision: data?.revision ?? 0 };
  } });
}
export function useSaveMasterDefault() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ template, revision }: { template: MasterPage; revision: number }) => {
    if (!validMaster(template)) throw new Error('Invalid master page');
    // RLS verifies the administrator on the database; revision guards concurrent edits.
    const query = revision === 0
      ? supabase.from('psa_master_page_defaults').insert({ id: true, template: template as unknown as Json })
      : supabase.from('psa_master_page_defaults').update({ template: template as unknown as Json }).eq('id', true).eq('revision', revision);
    const { data, error } = await query.select('revision').single();
    if (error) throw error;
    return data;
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['psa-master-default'] }) });
}