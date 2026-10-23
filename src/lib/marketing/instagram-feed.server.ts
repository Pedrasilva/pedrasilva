import { instagramGraph } from './instagram-graph.server';
export type LivePost={id:string;caption:string;media_type:string;media_url?:string;thumbnail_url?:string;permalink?:string;timestamp?:string};
export async function readInstagramFeed(){
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {data:s}=await db.from('marketing_settings').select('instagram_account_id,instagram_feed,instagram_feed_at').eq('id',true).single();
  const cached=(Array.isArray(s?.instagram_feed)?s.instagram_feed:[]) as unknown as LivePost[];
  if(s?.instagram_feed_at&&Date.now()-Date.parse(s.instagram_feed_at)<900000)return {posts:cached,error:null};
  const token=process.env['META_SYSTEM_USER_TOKEN'];
  if(!token||!s?.instagram_account_id)return {posts:cached,error:'connectionUnavailable'};
  try{
    const graph=instagramGraph(token);
    const result=await graph(`${s.instagram_account_id}/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp,caption&limit=30`);
    const posts:LivePost[]=Array.isArray(result.data)?result.data.map((p:LivePost)=>({id:p.id,caption:p.caption??'',media_type:p.media_type,media_url:p.media_url,thumbnail_url:p.thumbnail_url,permalink:p.permalink,timestamp:p.timestamp})):[];
    await db.from('marketing_settings').update({instagram_feed:posts as unknown as import('@/integrations/supabase/types').Json,instagram_feed_at:new Date().toISOString(),instagram_feed_error:null}).eq('id',true);
    for(const p of posts)if(p.permalink)await db.from('marketing_post_drafts').update({published_url:p.permalink}).eq('ig_media_id',p.id);
    return {posts,error:null};
  }catch{await db.from('marketing_settings').update({instagram_feed_error:'feedUnavailable'}).eq('id',true);return {posts:cached,error:'feedUnavailable'};}
}
