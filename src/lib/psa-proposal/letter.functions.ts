import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
export const draftProposalLetter=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({proposalId:z.string().uuid()})).handler(async({data,context})=>{
  const {data:proposal,error}=await context.supabase.from('psa_proposals').select('*').eq('id',data.proposalId).single();
  if(error||!proposal)throw new Error('Forbidden');
  if(proposal.locked_at||proposal.status!=='draft')throw new Error('Proposal is not editable');
  const {draftLetter}=await import('./letter.server');
  return draftLetter(proposal,context.supabase);
});