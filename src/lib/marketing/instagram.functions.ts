import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
export const scheduleInstagram = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator(d=>z.object({draftId:z.string().uuid(),at:z.string().datetime(),now:z.boolean().default(false)}).parse(d))
  .handler(async({data,context})=>{
    const {error}=await context.supabase.rpc('marketing_schedule_instagram',{_id:data.draftId,_at:data.at,_now:data.now});
    if(error)throw new Error(error.message);
    if(data.now){const {runInstagramPublishing}=await import('./instagram-publish.server');return runInstagramPublishing(data.draftId);}
    return {processed:0,unavailable:false};
  });
export const instagramFeed = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data:allowed,error}=await context.supabase.rpc('has_module_permission',{_user_id:context.userId,_key:'marketing.view',_required_scope:'all'});
  if(error||!allowed)throw new Error('Not allowed');
  const {readInstagramFeed}=await import('./instagram-feed.server');
  return readInstagramFeed();
});
