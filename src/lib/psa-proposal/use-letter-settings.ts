import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_LETTER_SETTINGS, type LetterSettings } from './letter';
export function useLetterSettings() {
  return useQuery({queryKey:['psa-letter-settings'],queryFn:async()=>{
    const {data,error}=await supabase.from('psa_letter_settings').select('*').eq('id',true).maybeSingle();if(error)throw error;
    return {settings:data?{templates:data.templates as Record<string,string>,signatoryName:data.signatory_name,signatureData:data.signature_data}:DEFAULT_LETTER_SETTINGS,revision:data?.revision??0};
  }});
}
export function useSaveLetterSettings(){const qc=useQueryClient();return useMutation({mutationFn:async({settings,revision}:{settings:LetterSettings;revision:number})=>{
  const row={templates:settings.templates,signatory_name:settings.signatoryName,signature_data:settings.signatureData??null};
  const query=revision?supabase.from('psa_letter_settings').update(row).eq('id',true).eq('revision',revision):supabase.from('psa_letter_settings').insert({id:true,...row});
  const {error}=await query.select('revision').single();if(error)throw error;
},onSuccess:()=>qc.invalidateQueries({queryKey:['psa-letter-settings']})});}